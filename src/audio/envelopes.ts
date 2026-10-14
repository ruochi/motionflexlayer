import type { TrackEnvelope } from 'visualtone'
import type { Stereo } from './types.js'

/** 音轨包络：渲染一次音频得到，画面按 t 查表。可以 JSON 序列化，交给 worker 进程。 */
export type Envelopes = {
  fps: number
  duration: number
  /** 每条音轨（母线名或 tracks 里的 id）：起音时刻（秒）和逐帧电平（线性振幅，闪避之后）。 */
  tracks: Record<string, { onsets: number[]; level: number[] }>
  master: { level: number[] }
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

/** 和 visualtone 给音轨电平用的同一种跟随器（起 5 ms、落 80 ms），总线电平和音轨电平可以直接比。 */
function follow(s: Stereo, sampleRate: number): Float32Array {
  const atk = Math.exp(-1 / (0.005 * sampleRate))
  const rel = Math.exp(-1 / (0.08 * sampleRate))
  const out = new Float32Array(s.l.length)
  let e = 0
  for (let i = 0; i < out.length; i++) {
    const v = Math.max(Math.abs(s.l[i]!), Math.abs(s.r[i]!))
    e = v > e ? atk * e + (1 - atk) * v : rel * e + (1 - rel) * v
    out[i] = e
  }
  return out
}

/** 逐采样电平按帧取平均。gain 是总线淡入淡出，音轨电平也乘上，和听到的一致。 */
function perFrame(level: Float32Array, sampleRate: number, fps: number, frames: number, gain?: (n: number) => number): number[] {
  const out = new Array<number>(frames)
  for (let k = 0; k < frames; k++) {
    const a = Math.floor((k / fps) * sampleRate)
    const b = Math.min(level.length, Math.floor(((k + 1) / fps) * sampleRate))
    let sum = 0
    for (let n = a; n < b; n++) sum += level[n]! * (gain ? gain(n) : 1)
    out[k] = round(b > a ? sum / (b - a) : 0)
  }
  return out
}

export function toEnvelopes(
  mix: Stereo,
  levels: readonly TrackEnvelope[],
  onsets: Record<string, number[]>,
  sampleRate: number,
  fps: number,
  duration: number,
  gain?: (n: number) => number,
): Envelopes {
  const frames = Math.ceil(duration * fps)
  const tracks: Envelopes['tracks'] = {}
  for (const t of levels) {
    tracks[t.id] = { onsets: (onsets[t.id] ?? []).map(round), level: perFrame(t.level, sampleRate, fps, frames, gain) }
  }
  return { fps, duration, tracks, master: { level: perFrame(follow(mix, sampleRate), sampleRate, fps, frames) } }
}

/**
 * 某一时刻的音轨读数。画面跟着声音动，但仍然是 t 的纯函数：
 * 包络在渲染前算好，同一个 t 永远查到同一个值。
 */
export class AudioFrame {
  constructor(
    private readonly env: Envelopes,
    readonly t: number,
  ) {}

  /** 另一时刻的读数。画电平历史（滚动波形）时用：f.audio.at(f.t - k / fps).level('voice')。 */
  at(t: number): AudioFrame {
    return new AudioFrame(this.env, t)
  }

  /** 有包络的音轨名。 */
  get tracks(): string[] {
    return Object.keys(this.env.tracks)
  }

  private series(track?: string): number[] {
    if (track == null || track === 'master') return this.env.master.level
    const tr = this.env.tracks[track]
    if (!tr) throw new Error(`没有这条音轨的包络：${track}。现有：${this.tracks.join('、')}`)
    return tr.level
  }

  /** RMS 电平，线性 0..1，帧间线性插值。缺省是总线。 */
  level(track?: string): number {
    const s = this.series(track)
    if (s.length === 0) return 0
    const x = this.t * this.env.fps - 0.5
    const i = Math.floor(x)
    if (i < 0) return s[0]!
    if (i >= s.length - 1) return s[s.length - 1]!
    const k = x - i
    return s[i]! * (1 - k) + s[i + 1]! * k
  }

  /** 电平，dBFS。静音是 -120。 */
  db(track?: string): number {
    const v = this.level(track)
    return v > 1e-6 ? 20 * Math.log10(v) : -120
  }

  /** 这条音轨全部起音时刻，升序。喂给 pulse / since / springSteps。 */
  onsets(track: string): number[] {
    const tr = this.env.tracks[track]
    if (!tr) throw new Error(`没有这条音轨的包络：${track}。现有：${this.tracks.join('、')}`)
    return tr.onsets
  }

  /** 距上一次起音过了多少秒。还没起过音时是 Infinity。 */
  since(track: string): number {
    const list = this.onsets(track)
    let last = -Infinity
    for (const v of list) {
      if (v > this.t) break
      last = v
    }
    return this.t - last
  }
}
