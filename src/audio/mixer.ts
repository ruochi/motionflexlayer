import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { render as renderScore, ScoreSchema, type ClipAudio, type Score, type Track } from 'visualtone'
import type { Timeline } from '../timeline.js'
import { decodeAudio } from './decode.js'
import { toEnvelopes, type Envelopes } from './envelopes.js'
import type { AudioBus, AudioClip, AudioSource, AudioSpec, Duck, Stereo } from './types.js'

export const dbToGain = (db: number) => 10 ** (db / 20)
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity)

/** 同一个音效放在一组时间点上。times 通常来自 tl.times('...')。 */
export function sfx(src: AudioSource, times: readonly number[], opts: Omit<AudioClip, 'src' | 'at'> = {}): AudioClip[] {
  return times.map((at) => ({ ...opts, src, at }))
}

export type MixOptions = {
  duration: number
  baseDir?: string
  /** 画面要读的包络帧率。缺省不算包络。 */
  envelopeFps?: number
  /** 保留每条音轨的分轨，分析旁白和音乐的频段关系时要用。 */
  stems?: boolean
}

export type MixResult = Stereo & {
  sampleRate: number
  /** 交给 visualtone 的完整乐谱，可以存下来用 visualtone 命令行复现。 */
  score: Score
  /** 积分响度 LUFS（设了 master.lufs 时是实测值）。 */
  lufs: number
  /** 限幅器最深压了多少 dB。超过 3 dB 说明某处太冲。 */
  limiterDb: number
  envelopes?: Envelopes
  stems?: { id: string; l: Float32Array; r: Float32Array }[]
  /** 混进来的外部音频和它们的 sha256。 */
  inputs: { src: string; sha256: string }[]
}

const ROLE_BY_NAME: Record<string, 'voice' | 'music' | 'sfx'> = {
  voice: 'voice',
  vo: 'voice',
  narration: 'voice',
  music: 'music',
  bgm: 'music',
  sfx: 'sfx',
  fx: 'sfx',
}

const sha = (data: Buffer | Float32Array) =>
  createHash('sha256')
    .update(Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    .digest('hex')

type Loaded = { key: string; audio: Stereo; sha256: string }

/** 按 times 闪避的增益曲线，编成 visualtone 的 automation.gain 关键帧。 */
export function duckKeyframes(d: Duck, duration: number): { t: number; v: number }[] {
  const times = [...(d.times ?? [])].sort((a, b) => a - b)
  if (times.length === 0) return []
  const depth = d.depth ?? 0.5
  const attack = d.attack ?? 0.008
  const hold = d.hold ?? 0
  const release = d.release ?? 0.18
  const env = (dt: number) =>
    dt < 0 ? 0 : dt < attack ? dt / attack : dt < attack + hold ? 1 : Math.exp(-(dt - attack - hold) / release)
  const keys: { t: number; v: number }[] = []
  const push = (t: number, v: number) => {
    const last = keys[keys.length - 1]
    if (last && t <= last.t + 1e-6) return
    keys.push({ t: Math.round(t * 1e5) / 1e5, v: Math.round(v * 1e4) / 1e4 })
  }
  const tail = attack + hold + release * 5
  for (let k = 0; k < times.length; k++) {
    const t0 = times[k]!
    const next = times[k + 1] ?? Infinity
    const prev = times[k - 1]
    const carried = prev != null ? env(t0 - prev) : 0
    push(Math.max(0, t0 - 0.0005), 1 - depth * carried)
    const end = Math.min(t0 + tail, next, duration)
    const steps = [0, attack, attack + hold]
    for (let s = 1; s < 10; s++) steps.push(attack + hold + (release * 5 * s) / 10)
    for (const dt of steps) {
      if (t0 + dt > end) break
      push(t0 + dt, 1 - depth * Math.max(env(dt), prev != null ? env(t0 + dt - prev) : 0))
    }
    if (end < next) push(end, 1)
  }
  return keys
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {}
  for (const k of keys) if (obj[k] != null) out[k] = obj[k]
  return out
}

function roleOf(name: string, bus: AudioBus | undefined): Track['role'] {
  return bus?.role ?? ROLE_BY_NAME[name.toLowerCase()]
}

function bake(src: Stereo, opts: { pan?: number; loopTo?: number; sampleRate: number }): Stereo {
  let { l, r } = src
  if (opts.loopTo != null && l.length > 0) {
    const n = Math.ceil(opts.loopTo * opts.sampleRate)
    const L = new Float32Array(n)
    const R = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      L[i] = l[i % l.length]!
      R[i] = r[i % r.length]!
    }
    l = L
    r = R
  }
  const pan = Math.max(-1, Math.min(1, opts.pan ?? 0))
  if (pan !== 0) {
    const a = ((pan + 1) * Math.PI) / 4
    const gl = Math.cos(a) * Math.SQRT2
    const gr = Math.sin(a) * Math.SQRT2
    l = l.map((v) => v * gl)
    r = r.map((v) => v * gr)
  }
  return { l, r }
}

/**
 * 把 AudioSpec 编成 visualtone 的乐谱：每条母线一条音轨，片段变成 clips，
 * 声像和循环预先烘进缓冲，按时间点的闪避变成 automation.gain，按电平的闪避交给 visualtone 的 duck。
 */
export async function compileAudio(
  spec: AudioSpec,
  opts: { duration: number; baseDir?: string },
): Promise<{ score: Score; clips: Record<string, ClipAudio>; inputs: MixResult['inputs'] }> {
  const sr = spec.sampleRate ?? 48000
  const baseDir = opts.baseDir ?? process.cwd()
  const loaded = new Map<AudioSource, Promise<Loaded>>()
  let anon = 0
  const load = (src: AudioSource): Promise<Loaded> => {
    let p = loaded.get(src)
    if (!p) {
      if (typeof src === 'string') {
        const path = isAbsolute(src) ? src : resolve(baseDir, src)
        p = Promise.all([decodeAudio(path, sr), readFile(path)]).then(([audio, bytes]) => ({ key: src, audio, sha256: sha(bytes) }))
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

  const clips: Record<string, ClipAudio> = {}
  const inputs = new Map<string, string>()
  const tracks = new Map<string, Track>()
  const buses = spec.buses ?? {}
  const trackOf = (name: string): Track => {
    let t = tracks.get(name)
    if (!t) {
      const bus = buses[name]
      t = { id: name, channel: [0, 1], role: roleOf(name, bus), clips: [] }
      if (bus) Object.assign(t, pick(bus, ['eq', 'comp', 'space', 'room', 'echo']))
      tracks.set(name, t)
    }
    return t
  }

  for (const clip of spec.clips ?? []) {
    const busName = clip.bus ?? 'main'
    const src = await load(clip.src)
    inputs.set(src.key, src.sha256)
    // visualtone 的片段不能从负时间开始，负的 at 折算成从音源中间取
    const at = Math.max(0, clip.at ?? 0)
    const offset = (clip.offset ?? 0) + Math.max(0, -(clip.at ?? 0))
    const pan = clip.pan ?? 0
    let key = src.key
    let trim: [number, number] | undefined
    const srcSec = src.audio.l.length / sr
    if (clip.loop) {
      const span = clip.duration ?? Math.max(0, opts.duration - at)
      const looped = bake({ l: src.audio.l.subarray(Math.round(offset * sr)), r: src.audio.r.subarray(Math.round(offset * sr)) }, { pan, loopTo: span, sampleRate: sr })
      key = `${src.key}@offset=${offset},loop=${span},pan=${pan}`
      clips[key] = { sampleRate: sr, buffers: [looped.l, looped.r] }
    } else {
      if (pan !== 0) {
        key = `${src.key}@pan=${pan}`
        const panned = bake(src.audio, { pan, sampleRate: sr })
        clips[key] ??= { sampleRate: sr, buffers: [panned.l, panned.r] }
      } else clips[key] ??= { sampleRate: sr, buffers: [src.audio.l, src.audio.r], sha256: src.sha256 }
      if (offset > 0 || clip.duration != null) trim = [offset, Math.min(srcSec, (clip.offset ?? 0) + (clip.duration ?? srcSec))]
    }
    const gain = dbToGain((clip.gain ?? 0) + (buses[busName]?.gain ?? 0))
    trackOf(busName).clips!.push({
      src: key,
      at,
      gain: Math.round(gain * 1e6) / 1e6,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
      ...(trim ? { trim } : {}),
    })
  }

  const native = spec.tracks ?? []
  const ids = new Set([...tracks.keys(), ...native.map((t) => t.id)])
  for (const [name, bus] of Object.entries(buses)) {
    const t = tracks.get(name)
    const ducks = bus.duck == null ? [] : Array.isArray(bus.duck) ? bus.duck : [bus.duck]
    if (!t) {
      if (ducks.length || bus.gain) console.warn(`母线 ${name} 上没有片段，设置被忽略`)
      continue
    }
    const by = ducks.filter((d) => d.by)
    if (by.length > 1) throw new Error(`母线 ${name}：一条母线只能按一个来源闪避（duck.by）`)
    const d = by[0]
    if (d) {
      if (!ids.has(d.by!)) throw new Error(`母线 ${name} 的 duck.by 指向不存在的母线或音轨：${d.by}`)
      t.duck = {
        by: d.by!,
        amount: d.depth ?? 0.5,
        holdMs: (d.hold ?? 0.25) * 1000,
        releaseMs: (d.release ?? 0.18) * 1000,
        ...(d.band ? { band: d.band } : {}),
      }
    }
    const timed = ducks.filter((x) => x.times?.length)
    if (timed.length) {
      const curves = timed.map((x) => duckKeyframes(x, opts.duration))
      t.automation = { gain: curves.length === 1 ? curves[0]! : multiplyKeyframes(curves) }
    }
  }

  const m = spec.master ?? {}
  const score = {
    sampleRate: sr,
    duration: opts.duration,
    ...(spec.bpm ? { bpm: spec.bpm } : {}),
    master: {
      lufs: m.lufs ?? -16,
      drive: m.drive ?? 0,
      limiter: { ceiling: m.ceiling ?? -1 },
      ...(m.reverb ? { reverb: m.reverb } : {}),
      ...(m.room ? { room: m.room } : {}),
      ...(m.delay ? { delay: m.delay } : {}),
      ...(m.eq ? { eq: m.eq } : {}),
      ...(m.comp ? { comp: m.comp } : {}),
    },
    tracks: [...tracks.values(), ...native.map((t) => ({ channel: [0, 1], ...t }))],
  } as Score
  return { score, clips, inputs: [...inputs].map(([src, sha256]) => ({ src, sha256 })) }
}

function multiplyKeyframes(curves: { t: number; v: number }[][]): { t: number; v: number }[] {
  const at = (keys: { t: number; v: number }[], t: number) => {
    if (t <= keys[0]!.t) return keys[0]!.v
    for (let i = 1; i < keys.length; i++) {
      const b = keys[i]!
      if (t <= b.t) {
        const a = keys[i - 1]!
        return a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1e-9, b.t - a.t)
      }
    }
    return keys[keys.length - 1]!.v
  }
  const times = [...new Set(curves.flatMap((c) => c.map((k) => k.t)))].sort((a, b) => a - b)
  return times.map((t) => ({ t, v: Math.round(curves.reduce((g, c) => g * at(c, t), 1) * 1e4) / 1e4 }))
}

const fadeCurve = (k: number) => Math.sin((Math.min(1, Math.max(0, k)) * Math.PI) / 2)

/**
 * 混音：AudioSpec → visualtone 乐谱 → 渲染。响度按 LUFS 对齐，限幅器兜底，
 * 同样的输入永远得到同样的输出。总线淡入淡出在渲染之后做。
 */
export async function mixAudio(spec: AudioSpec, opts: MixOptions): Promise<MixResult> {
  const { score, clips, inputs } = await compileAudio(spec, opts)
  const parsed = ScoreSchema.parse(score)
  const res = renderScore(parsed, {
    clips,
    stems: opts.stems,
    envelopes: opts.envelopeFps ? { fps: opts.envelopeFps } : undefined,
  })
  const sr = res.sampleRate
  const N = Math.ceil(opts.duration * sr)
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  l.set(res.buffers[0]!.subarray(0, N))
  r.set((res.buffers[1] ?? res.buffers[0]!).subarray(0, N))
  const fi = (spec.master?.fadeIn ?? 0) * sr
  const fo = (spec.master?.fadeOut ?? 0) * sr
  if (fi > 0 || fo > 0) {
    for (let n = 0; n < N; n++) {
      let g = 1
      if (fi > 0 && n < fi) g *= fadeCurve(n / fi)
      if (fo > 0 && n > N - fo) g *= fadeCurve((N - n) / fo)
      l[n]! *= g
      r[n]! *= g
    }
  }
  return {
    l,
    r,
    sampleRate: sr,
    score,
    lufs: res.master.loudnessDb,
    limiterDb: res.master.limiterReductionDb,
    envelopes: res.envelopes ? toEnvelopes(res.envelopes, opts.duration) : undefined,
    stems: res.stems,
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
