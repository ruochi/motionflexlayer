import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { prepare, type Composition } from '../composition.js'
import { analyzeAudio, drawWaveform, type AudioReport } from './analyze.js'
import { decodeAudio } from './decode.js'
import type { AudioClip, AudioSource, AudioSpec, Duck, Stereo } from './types.js'
import { encodeWav } from './wav.js'

export const dbToGain = (db: number) => 10 ** (db / 20)
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity)

/** 同一个音效放在一组时间点上。times 通常来自 tl.times('...')。 */
export function sfx(src: AudioSource, times: readonly number[], opts: Omit<AudioClip, 'src' | 'at'> = {}): AudioClip[] {
  return times.map((at) => ({ ...opts, src, at }))
}

const stereo = (n: number): Stereo => ({ l: new Float32Array(n), r: new Float32Array(n) })

async function loadSource(src: AudioSource, sampleRate: number, duration: number, baseDir: string): Promise<Stereo> {
  if (typeof src === 'string') return decodeAudio(isAbsolute(src) ? src : resolve(baseDir, src), sampleRate)
  const length = Math.ceil(duration * sampleRate)
  return src.render({ sampleRate, duration, length })
}

/** 等功率淡变曲线。 */
const fadeCurve = (k: number) => Math.sin((Math.min(1, Math.max(0, k)) * Math.PI) / 2)

function placeClip(bus: Stereo, src: Stereo, clip: AudioClip, sr: number): void {
  const N = bus.l.length
  const offset = Math.round((clip.offset ?? 0) * sr)
  const srcLen = src.l.length - offset
  if (srcLen <= 0) return
  const start = Math.round((clip.at ?? 0) * sr)
  const len =
    clip.duration != null ? Math.round(clip.duration * sr) : clip.loop ? N - start : srcLen
  const g = dbToGain(clip.gain ?? 0)
  const pan = Math.max(-1, Math.min(1, clip.pan ?? 0))
  const a = ((pan + 1) * Math.PI) / 4
  const gl = g * Math.cos(a) * Math.SQRT2
  const gr = g * Math.sin(a) * Math.SQRT2
  const fi = Math.round((clip.fadeIn ?? 0) * sr)
  const fo = Math.round((clip.fadeOut ?? 0) * sr)
  for (let i = 0; i < len; i++) {
    const n = start + i
    if (n < 0) continue
    if (n >= N) break
    let j = i
    if (j >= srcLen) {
      if (!clip.loop) break
      j %= srcLen
    }
    let env = 1
    if (fi > 0 && i < fi) env *= fadeCurve(i / fi)
    if (fo > 0 && i > len - fo) env *= fadeCurve((len - i) / fo)
    bus.l[n]! += src.l[offset + j]! * gl * env
    bus.r[n]! += src.r[offset + j]! * gr * env
  }
}

function hitEnv(dt: number, attack: number, hold: number, release: number): number {
  if (dt < 0) return 0
  if (dt < attack) return dt / attack
  if (dt < attack + hold) return 1
  return Math.exp(-(dt - attack - hold) / release)
}

/** 闪避增益曲线，每个采样一个值。 */
function duckGain(d: Duck, N: number, sr: number, buses: Map<string, Stereo>): Float32Array {
  const out = new Float32Array(N).fill(1)
  const depth = d.depth ?? 0.5
  const attack = d.attack ?? 0.008
  const hold = d.hold ?? 0
  const release = d.release ?? 0.18
  if (d.times && d.times.length) {
    const times = [...d.times].sort((a, b) => a - b)
    let k = -1
    for (let n = 0; n < N; n++) {
      const t = n / sr
      while (k + 1 < times.length && times[k + 1]! <= t) k++
      if (k < 0) continue
      let env = hitEnv(t - times[k]!, attack, hold, release)
      if (k > 0) env = Math.max(env, hitEnv(t - times[k - 1]!, attack, hold, release))
      out[n] = 1 - depth * env
    }
  }
  if (d.by) {
    const src = buses.get(d.by)
    if (!src) throw new Error(`duck.by 指向不存在的母线：${d.by}`)
    const ca = Math.exp(-1 / (attack * sr))
    const cr = Math.exp(-1 / (release * sr))
    const thr = d.threshold ?? -30
    let level = 0
    for (let n = 0; n < N; n++) {
      const x = Math.max(Math.abs(src.l[n]!), Math.abs(src.r[n]!))
      level = x > level ? ca * level + (1 - ca) * x : cr * level + (1 - cr) * x
      const over = (gainToDb(level) - thr) / 12
      const amount = over <= 0 ? 0 : over >= 1 ? 1 : over
      out[n] = Math.min(out[n]!, 1 - depth * amount)
    }
  }
  return out
}

/** 软限幅：天花板以下 85% 线性，往上用 tanh 平滑压到天花板，不会硬削波。 */
function softLimit(x: number, ceiling: number): number {
  const k = ceiling * 0.85
  const ax = Math.abs(x)
  if (ax <= k) return x
  return Math.sign(x) * (k + (ceiling - k) * Math.tanh((ax - k) / (ceiling - k)))
}

export type MixResult = Stereo & {
  sampleRate: number
  /** 被限幅器压过的采样比例。超过 1% 说明整体太响。 */
  limited: number
}

export type MixOptions = {
  duration: number
  baseDir?: string
}

/**
 * 混音：音源 → 片段（位置、裁剪、循环、增益、声像、淡变）→ 母线（增益、闪避）→ 总线（淡变、归一、软限幅）。
 * 全部离线逐采样计算，同样的输入永远得到同样的输出。
 */
export async function mixAudio(spec: AudioSpec, opts: MixOptions): Promise<MixResult> {
  const sr = spec.sampleRate ?? 48000
  const N = Math.ceil(opts.duration * sr)
  const baseDir = opts.baseDir ?? process.cwd()
  const buses = new Map<string, Stereo>()
  const busOf = (name: string) => {
    let b = buses.get(name)
    if (!b) buses.set(name, (b = stereo(N)))
    return b
  }
  for (const name of Object.keys(spec.buses ?? {})) busOf(name)
  const sources = new Map<AudioSource, Promise<Stereo>>()
  for (const clip of spec.clips) {
    let p = sources.get(clip.src)
    if (!p) sources.set(clip.src, (p = loadSource(clip.src, sr, opts.duration, baseDir)))
    placeClip(busOf(clip.bus ?? 'main'), await p, clip, sr)
  }

  const L = new Float32Array(N)
  const R = new Float32Array(N)
  for (const [name, b] of buses) {
    const cfg = spec.buses?.[name] ?? {}
    const g = dbToGain(cfg.gain ?? 0)
    const ducks = cfg.duck == null ? [] : Array.isArray(cfg.duck) ? cfg.duck : [cfg.duck]
    const curves = ducks.map((d) => duckGain(d, N, sr, buses))
    for (let n = 0; n < N; n++) {
      let k = g
      for (const c of curves) k *= c[n]!
      L[n]! += b.l[n]! * k
      R[n]! += b.r[n]! * k
    }
  }

  const m = spec.master ?? {}
  const mg = dbToGain(m.gain ?? 0)
  const fi = (m.fadeIn ?? 0) * sr
  const fo = (m.fadeOut ?? 0) * sr
  let peak = 0
  for (let n = 0; n < N; n++) {
    let env = mg
    if (fi > 0 && n < fi) env *= fadeCurve(n / fi)
    if (fo > 0 && n > N - fo) env *= fadeCurve((N - n) / fo)
    L[n]! *= env
    R[n]! *= env
    peak = Math.max(peak, Math.abs(L[n]!), Math.abs(R[n]!))
  }
  if (m.normalize != null && peak > 0) {
    const k = dbToGain(m.normalize) / peak
    for (let n = 0; n < N; n++) {
      L[n]! *= k
      R[n]! *= k
    }
  }
  let limitedCount = 0
  if (m.limit !== false) {
    const c = dbToGain(m.limit ?? -0.5)
    for (let n = 0; n < N; n++) {
      if (Math.abs(L[n]!) > c * 0.85 || Math.abs(R[n]!) > c * 0.85) limitedCount++
      L[n] = softLimit(L[n]!, c)
      R[n] = softLimit(R[n]!, c)
    }
  }
  return { l: L, r: R, sampleRate: sr, limited: N > 0 ? limitedCount / N : 0 }
}

export type RenderAudioResult = { file: string; report: AudioReport; waveform?: string }

/** 合成的音轨混成 WAV，同时写一份文字报告和波形图，供看不到、听不到声音的一方检查。 */
export async function renderAudio(
  comp: Composition,
  outFile: string,
  opts: { from?: number; to?: number; waveform?: boolean } = {},
): Promise<RenderAudioResult> {
  if (!comp.audio) throw new Error('合成没有定义 audio')
  // 编曲可能依赖 setup 里的预计算（例如粒子闪光的时刻）
  await prepare(comp)
  const spec = typeof comp.audio === 'function' ? await comp.audio({ tl: comp.tl, duration: comp.duration }) : comp.audio
  const mix = await mixAudio(spec, { duration: comp.duration, baseDir: comp.baseDir })
  const sr = mix.sampleRate
  const a = Math.round((opts.from ?? 0) * sr)
  const b = Math.round((opts.to ?? comp.duration) * sr)
  const cut: Stereo = { l: mix.l.subarray(a, b), r: mix.r.subarray(a, b) }
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, encodeWav(cut, sr))
  const report = analyzeAudio(mix, sr, comp.tl, mix.limited)
  let waveform: string | undefined
  if (opts.waveform) {
    const { dir, name } = parse(outFile)
    waveform = join(dir, `${name}.waveform.png`)
    await writeFile(waveform, drawWaveform(mix, sr, comp.tl))
  }
  return { file: outFile, report, waveform }
}
