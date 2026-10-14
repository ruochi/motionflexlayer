import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { compile, parseScore, render as renderScore, type ClipBuffer, type Issue, type ScoreInput } from 'visualtone'
import type { Timeline } from '../timeline.js'
import { decodeAudio } from './decode.js'
import { toEnvelopes, type Envelopes } from './envelopes.js'
import type { AudioBus, AudioClip, AudioSection, AudioSource, AudioSpec, AudioTrack, Compressor, Duck, Stereo, TimedDuck } from './types.js'

export const dbToGain = (db: number) => 10 ** (db / 20)
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity)

/** 同一个音效放在一组时间点上。times 通常来自 tl.times('...')。 */
export function sfx(src: AudioSource, times: readonly number[], opts: Omit<AudioClip, 'src' | 'at'> = {}): AudioClip[] {
  return times.map((at) => ({ ...opts, src, at }))
}

export type MixOptions = {
  duration: number
  baseDir?: string
  /** 缺省的速度、拍号和段落从这里取。 */
  timeline?: Timeline
  /** 画面要读的包络帧率。缺省不算包络。 */
  envelopeFps?: number
}

export type MixResult = Stereo & {
  sampleRate: number
  /** 交给 visualtone 的乐谱。片段的 src 是键名，采样在内存里传过去。 */
  score: ScoreInput
  /** 积分响度，LUFS。 */
  lufs: number
  /** 限幅器最深压了多少 dB。 */
  limiterDb: number
  /** visualtone 的报告：出调、音区越界、力度呆板、音效太挤、人声被盖住、限幅太深。 */
  issues: Issue[]
  envelopes?: Envelopes
  /** 混进来的外部音频和它们的 sha256。 */
  inputs: { src: string; sha256: string }[]
}

export type CompiledAudio = {
  score: ScoreInput
  clips: Record<string, ClipBuffer>
  /** 母线名 → 压缩器和按时间点的闪避，渲染时在 processTrack 里做。 */
  processors: Record<string, { comp?: Compressor; ducks: TimedDuck[] }>
  inputs: MixResult['inputs']
}

const ROLE_BY_NAME: Record<string, 'voice' | 'music' | 'sfx'> = {
  voice: 'voice',
  vo: 'voice',
  narration: 'voice',
  music: 'music',
  bgm: 'music',
}

const METERS = new Set(['2/4', '3/4', '4/4', '5/4'])
const SECTION_ID = /^[A-Za-z][A-Za-z0-9_-]*$/

const sha = (data: Buffer | Float32Array) =>
  createHash('sha256')
    .update(Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    .digest('hex')

type Loaded = { key: string; audio: Stereo; sha256: string }

function roleOf(name: string, bus: AudioBus | undefined): 'voice' | 'music' | 'sfx' {
  return bus?.role ?? ROLE_BY_NAME[name.toLowerCase()] ?? 'sfx'
}

function panned(src: Stereo, pan: number): Stereo {
  const p = Math.max(-1, Math.min(1, pan))
  const a = ((p + 1) * Math.PI) / 4
  const gl = Math.cos(a) * Math.SQRT2
  const gr = Math.sin(a) * Math.SQRT2
  return { l: src.l.map((v) => v * gl), r: src.r.map((v) => v * gr) }
}

/** 时间轴的段落换成乐谱的 sections。visualtone 的段落 id 要字母开头，不合格的换成 s0、s1……，边界不变。 */
export function sectionsOf(tl: Timeline): AudioSection[] {
  const used = new Set<string>()
  return tl.sections.map((s, i) => {
    let id = SECTION_ID.test(s.name) ? s.name : `s${i}`
    while (used.has(id)) id = `${id}_${i}`
    used.add(id)
    return { id, at: Math.max(0, s.from) }
  })
}

/**
 * 把 AudioSpec 编成 visualtone 的乐谱：每条母线一条音轨，片段变成 clips，采样在内存里传；
 * 负的 at 折算成 offset，声像烘进缓冲；跟电平的闪避交给 visualtone，压缩和按时间点的闪避留给 processTrack。
 */
export async function compileAudio(spec: AudioSpec, opts: MixOptions): Promise<CompiledAudio> {
  const sr = spec.sampleRate ?? 48000
  const baseDir = opts.baseDir ?? process.cwd()
  const loaded = new Map<AudioSource, Promise<Loaded>>()
  let anon = 0
  const load = (src: AudioSource): Promise<Loaded> => {
    let p = loaded.get(src)
    if (!p) {
      if (typeof src === 'string') {
        const path = isAbsolute(src) ? src : resolve(baseDir, src)
        p = Promise.all([decodeAudio(path, sr), readFile(path)]).then(([audio, bytes]) => ({ key: relative(baseDir, path), audio, sha256: sha(bytes) }))
      } else {
        const key = `fn:${src.name ?? 'source'}#${anon++}`
        p = Promise.resolve(src.render({ sampleRate: sr, duration: opts.duration, length: Math.ceil(opts.duration * sr) })).then(
          (audio) => ({ key, audio, sha256: sha(audio.l) }),
        )
      }
      loaded.set(src, p)
    }
    return p
  }

  const clips: Record<string, ClipBuffer> = {}
  const inputs = new Map<string, string>()
  const buses = spec.buses ?? {}
  const tracks = new Map<string, AudioTrack & { clips: NonNullable<AudioTrack['clips']> }>()
  const trackOf = (name: string) => {
    let t = tracks.get(name)
    if (!t) {
      const bus = buses[name]
      t = { id: name, role: roleOf(name, bus), clips: [] }
      if (bus?.gain) t.gain = bus.gain
      if (bus?.space != null) t.space = bus.space
      tracks.set(name, t)
    }
    return t
  }
  for (const name of Object.keys(buses)) trackOf(name)

  for (const clip of spec.clips ?? []) {
    const src = await load(clip.src)
    inputs.set(src.key, src.sha256)
    const at = Math.max(0, clip.at ?? 0)
    const offset = (clip.offset ?? 0) + Math.max(0, -(clip.at ?? 0))
    const pan = clip.pan ?? 0
    let key = src.key
    if (pan !== 0) {
      key = `${src.key}@pan=${pan}`
      if (!clips[key]) {
        const p = panned(src.audio, pan)
        clips[key] = { sampleRate: sr, channels: [p.l, p.r] }
      }
    } else clips[key] ??= { sampleRate: sr, channels: [src.audio.l, src.audio.r] }
    const duration = clip.loop ? (clip.duration ?? Math.max(0, opts.duration - at)) : clip.duration
    trackOf(clip.bus ?? 'main').clips.push({
      src: key,
      at,
      ...(offset > 0 ? { offset } : {}),
      ...(duration != null ? { duration } : {}),
      ...(clip.loop ? { loop: true } : {}),
      ...(clip.gain ? { gain: clip.gain } : {}),
      ...(clip.fadeIn ? { fadeIn: clip.fadeIn } : {}),
      ...(clip.fadeOut ? { fadeOut: clip.fadeOut } : {}),
    })
  }

  const processors: CompiledAudio['processors'] = {}
  for (const [name, bus] of Object.entries(buses)) {
    const ducks: Duck[] = bus.duck == null ? [] : Array.isArray(bus.duck) ? bus.duck : [bus.duck]
    const timed = ducks.filter((d): d is TimedDuck => typeof d === 'object' && 'times' in d)
    const level = ducks.filter((d): d is Exclude<Duck, TimedDuck> => !(typeof d === 'object' && 'times' in d))
    if (level.length > 1) throw new Error(`母线 ${name}：'auto'、'off' 和 { by } 只能写一个`)
    const d = level[0]
    const t = tracks.get(name)!
    if (typeof d === 'string') t.duck = d
    else if (d) t.duck = { by: d.by, amount: d.depth ?? 0.5, ...(d.release != null ? { release: d.release } : {}) }
    if (timed.length || bus.comp) processors[name] = { comp: bus.comp, ducks: timed }
  }

  const tl = opts.timeline
  const tempo = spec.tempo ?? (tl ? { bpm: tl.bpm, ...(METERS.has(`${tl.beatsPerBar}/4`) ? { meter: `${tl.beatsPerBar}/4` as '4/4' } : {}) } : undefined)
  const sections = spec.sections ?? (tl && tl.sections.length ? sectionsOf(tl) : undefined)
  const m = spec.master ?? {}
  const score: ScoreInput = {
    version: 2,
    sampleRate: sr,
    duration: opts.duration,
    ...(spec.seed != null ? { seed: spec.seed } : {}),
    ...(tempo ? { tempo } : {}),
    ...(spec.key ? { key: spec.key } : {}),
    ...(sections ? { sections } : {}),
    tracks: [...tracks.values(), ...(spec.tracks ?? [])],
    mix: { loudness: m.lufs ?? -16, ceiling: m.ceiling ?? -1 },
  }
  parseScore(score)
  return { score, clips, processors, inputs: [...inputs].map(([src, sha256]) => ({ src, sha256 })) }
}

/** 按时间点闪避的增益，逐采样。重叠的两次取压得更深的那次。 */
export function timedDuckGain(ducks: readonly TimedDuck[], length: number, sampleRate: number): Float32Array {
  const gain = new Float32Array(length).fill(1)
  for (const d of ducks) {
    const depth = d.depth ?? 0.5
    const attack = d.attack ?? 0.008
    const hold = d.hold ?? 0
    const release = d.release ?? 0.18
    const tail = attack + hold + release * 6
    const env = new Float32Array(length)
    for (const t0 of d.times) {
      const a = Math.max(0, Math.round(t0 * sampleRate))
      const b = Math.min(length, Math.round((t0 + tail) * sampleRate))
      for (let i = a; i < b; i++) {
        const dt = i / sampleRate - t0
        const e = dt < attack ? dt / attack : dt < attack + hold ? 1 : Math.exp(-(dt - attack - hold) / release)
        if (e > env[i]!) env[i] = e
      }
    }
    for (let i = 0; i < length; i++) gain[i]! *= 1 - depth * env[i]!
  }
  return gain
}

/** 前馈压缩：峰值跟随，按 dB 算增益衰减，不补偿（响度对齐会补回来）。两个声道共用一个增益，声像不漂。 */
export function compress(audio: readonly Float32Array[], sampleRate: number, c: Compressor): void {
  const threshold = c.threshold ?? -20
  const ratio = Math.max(1, c.ratio ?? 3)
  const atk = Math.exp(-1 / ((c.attack ?? 0.005) * sampleRate))
  const rel = Math.exp(-1 / ((c.release ?? 0.12) * sampleRate))
  let env = 0
  for (let i = 0; i < audio[0]!.length; i++) {
    let v = 0
    for (const ch of audio) v = Math.max(v, Math.abs(ch[i]!))
    env = v > env ? atk * env + (1 - atk) * v : rel * env + (1 - rel) * v
    const over = gainToDb(env) - threshold
    if (over <= 0) continue
    const g = dbToGain(-over * (1 - 1 / ratio))
    for (const ch of audio) ch[i]! *= g
  }
}

const fadeCurve = (k: number) => Math.sin((Math.min(1, Math.max(0, k)) * Math.PI) / 2)

/** 每条音轨的起音时刻：音符、音效的锚点、片段的开头。相隔不到 30 毫秒的（和弦、扫弦）算一次。 */
function onsetsOf(score: ScoreInput): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const t of compile(parseScore(score)).tracks) {
    const times = [...t.notes.map((n) => n.at), ...t.sfx.map((s) => s.at), ...t.clips.map((c) => c.at)].sort((a, b) => a - b)
    const merged: number[] = []
    for (const v of times) if (!merged.length || v - merged[merged.length - 1]! >= 0.03) merged.push(v)
    out[t.id] = merged
  }
  return out
}

/**
 * 混音：AudioSpec → visualtone 乐谱 → 渲染。响度按 LUFS 对齐，限幅器兜底，
 * 同样的输入永远得到同样的输出。总线淡入淡出在渲染之后做。
 */
export async function mixAudio(spec: AudioSpec, opts: MixOptions): Promise<MixResult> {
  const { score, clips, processors, inputs } = await compileAudio(spec, opts)
  const res = renderScore(parseScore(score), {
    clips,
    baseDir: opts.baseDir,
    envelopes: opts.envelopeFps != null,
    processTrack: (track, audio, sampleRate) => {
      const p = processors[track.id]
      if (!p) return
      if (p.comp) compress(audio, sampleRate, p.comp)
      if (!p.ducks.length) return
      const g = timedDuckGain(p.ducks, audio[0].length, sampleRate)
      for (const ch of audio) for (let i = 0; i < ch.length; i++) ch[i]! *= g[i]!
    },
  })
  const sr = res.sampleRate
  const N = Math.ceil(opts.duration * sr)
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  l.set(res.left.subarray(0, N))
  r.set(res.right.subarray(0, N))
  const fi = (spec.master?.fadeIn ?? 0) * sr
  const fo = (spec.master?.fadeOut ?? 0) * sr
  const fade = fi > 0 || fo > 0 ? (n: number) => (fi > 0 && n < fi ? fadeCurve(n / fi) : 1) * (fo > 0 && n > N - fo ? fadeCurve((N - n) / fo) : 1) : undefined
  if (fade) {
    for (let n = 0; n < N; n++) {
      const g = fade(n)
      l[n]! *= g
      r[n]! *= g
    }
  }
  const envelopes =
    opts.envelopeFps != null && res.envelopes
      ? toEnvelopes({ l, r }, res.envelopes, onsetsOf(score), sr, opts.envelopeFps, opts.duration, fade)
      : undefined
  return {
    l,
    r,
    sampleRate: sr,
    score,
    lufs: res.report.loudnessDb,
    limiterDb: res.report.limiterDb,
    issues: res.report.issues,
    envelopes,
    inputs,
  }
}

/** 合成的 audio 字段求值。 */
export async function audioSpecOf(comp: {
  audio?: AudioSpec | ((ctx: { tl: Timeline; duration: number }) => AudioSpec | Promise<AudioSpec>)
  tl: Timeline
  duration: number
}): Promise<AudioSpec | undefined> {
  if (!comp.audio) return undefined
  return typeof comp.audio === 'function' ? comp.audio({ tl: comp.tl, duration: comp.duration }) : comp.audio
}
