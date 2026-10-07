/** 音轨包络：渲染一次音频得到，画面按 t 查表。可以 JSON 序列化，交给 worker 进程。 */
export type Envelopes = {
  fps: number
  duration: number
  /** 每条音轨（母线名或 tracks 里的 id）：起音时刻（秒）和逐帧 RMS 电平（线性）。 */
  tracks: Record<string, { onsets: number[]; level: number[] }>
  master: { level: number[] }
}

type RawEnvelopes = {
  fps: number
  tracks: Record<string, { onsets: number[]; level: Float32Array }>
  master: { level: Float32Array }
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

export function toEnvelopes(raw: RawEnvelopes, duration: number): Envelopes {
  const tracks: Envelopes['tracks'] = {}
  for (const [id, tr] of Object.entries(raw.tracks)) {
    tracks[id] = { onsets: tr.onsets.map(round).sort((a, b) => a - b), level: Array.from(tr.level, round) }
  }
  // 音效轨在 visualtone 里按事件展开成 fx:whoosh-1、fx:impact-7:low……，这里按前缀合回一条
  const groups = new Map<string, string[]>()
  for (const id of Object.keys(raw.tracks)) {
    const i = id.indexOf(':')
    if (i <= 0) continue
    const g = id.slice(0, i)
    if (!raw.tracks[g]) groups.set(g, [...(groups.get(g) ?? []), id])
  }
  for (const [g, ids] of groups) {
    const n = raw.master.level.length
    const level = new Array<number>(n).fill(0)
    for (const id of ids) {
      const lv = raw.tracks[id]!.level
      for (let k = 0; k < n; k++) level[k]! += (lv[k] ?? 0) ** 2
    }
    const onsets = [...new Set(ids.flatMap((id) => tracks[id]!.onsets))].sort((a, b) => a - b)
    tracks[g] = { onsets, level: level.map((v) => round(Math.sqrt(v))) }
  }
  return { fps: raw.fps, duration, tracks, master: { level: Array.from(raw.master.level, round) } }
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
