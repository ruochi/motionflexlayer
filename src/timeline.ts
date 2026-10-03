import { clamp, lastIndexAtOrBefore, range } from './math.js'

export type Cue<D = Record<string, unknown>> = {
  name: string
  /** 秒。 */
  t: number
  data?: D
}

export type Section<D = Record<string, unknown>> = {
  name: string
  from: number
  to: number
  index: number
  data?: D
}

export type SectionState<D = Record<string, unknown>> = Section<D> & {
  /** 进入本段多少秒。 */
  local: number
  /** 本段内进度 0..1。 */
  progress: number
}

export type TimelineOptions = {
  bpm?: number
  /** 每小节几拍，默认 4。 */
  beatsPerBar?: number
  /** 第 0 拍在第几秒。音乐有前奏留白时用。 */
  offset?: number
  /** 总时长，秒。最后一段的结尾。 */
  duration?: number
}

export type TimelineJSON = {
  bpm: number
  beatsPerBar: number
  offset: number
  duration: number
  sections: Section[]
  cues: Cue[]
}

/**
 * 时间轴：节拍网格 + 命名事件（cue）+ 段落（section）。
 *
 * 画面和声音都从这里取时间。一个 cue 名下可以有多个时间点，
 * 比如 `kick` 是所有底鼓、`impact` 是所有冲击。画面用 pulse(t, tl.times('kick'))
 * 做闪动，音频在同一组时间放鼓声，两边天然对齐。
 */
export class Timeline {
  readonly bpm: number
  readonly beatsPerBar: number
  readonly offset: number
  duration: number
  private readonly cueMap = new Map<string, Cue[]>()
  private readonly sectionList: Array<{ name: string; from: number; data?: Record<string, unknown> }> = []

  constructor(opts: TimelineOptions = {}) {
    this.bpm = opts.bpm ?? 120
    this.beatsPerBar = opts.beatsPerBar ?? 4
    this.offset = opts.offset ?? 0
    this.duration = opts.duration ?? 0
    if (!(this.bpm > 0)) throw new Error('bpm 必须大于 0')
  }

  /** 一拍几秒。 */
  get beatLength(): number {
    return 60 / this.bpm
  }

  /** 一小节几秒。 */
  get barLength(): number {
    return this.beatLength * this.beatsPerBar
  }

  /** 第 n 拍（从 0 数，可以是小数）的秒数。 */
  beat(n: number): number {
    return this.offset + n * this.beatLength
  }

  /** 第 bar 小节第 beat 拍的秒数，都从 0 数。 */
  bar(bar: number, beat = 0): number {
    return this.beat(bar * this.beatsPerBar + beat)
  }

  /** t 秒处是第几拍，小数。 */
  beatAt(t: number): number {
    return (t - this.offset) / this.beatLength
  }

  barAt(t: number): number {
    return this.beatAt(t) / this.beatsPerBar
  }

  /** 吸附到最近的 1/division 拍。division=2 是八分音符，4 是十六分。 */
  snap(t: number, division = 1): number {
    const step = this.beatLength / division
    return this.offset + Math.round((t - this.offset) / step) * step
  }

  /** 拍号区间 [fromBeat, toBeat) 内每 step 拍一个时间点，秒。 */
  beats(fromBeat: number, toBeat: number, step = 1): number[] {
    return range(fromBeat, toBeat, step).map((b) => this.beat(b))
  }

  /** 秒区间 [from, to) 内落在网格上的时间点，每 step 拍一个。 */
  grid(from: number, to: number, step = 1): number[] {
    const b0 = Math.ceil(this.beatAt(from) / step - 1e-9) * step
    return this.beats(b0, this.beatAt(to), step).filter((t) => t < to - 1e-9)
  }

  /** 登记事件。t 可以是一组时间。可链式调用。 */
  cue<D extends Record<string, unknown>>(name: string, t: number | readonly number[], data?: D): this {
    const list = this.cueMap.get(name) ?? []
    for (const v of typeof t === 'number' ? [t] : t) list.push({ name, t: v, data })
    list.sort((a, b) => a.t - b.t)
    this.cueMap.set(name, list)
    return this
  }

  /** 某个名字下的全部事件，按时间升序。不传名字返回全部。 */
  cues<D = Record<string, unknown>>(name?: string): Cue<D>[] {
    if (name != null) return (this.cueMap.get(name) ?? []) as Cue<D>[]
    return [...this.cueMap.values()].flat().sort((a, b) => a.t - b.t) as Cue<D>[]
  }

  /** 某个名字下的时间点，升序。喂给 pulse / since / springSteps。 */
  times(name: string): number[] {
    return this.cues(name).map((c) => c.t)
  }

  /** 某个名字的第一个时间点。不存在时报错，避免静默拿到 undefined。 */
  at(name: string): number {
    const c = this.cueMap.get(name)?.[0]
    if (!c) throw new Error(`时间轴里没有 cue：${name}`)
    return c.t
  }

  /** 截至 t 的最后一个事件。 */
  last<D = Record<string, unknown>>(name: string, t: number): Cue<D> | undefined {
    const list = this.cues<D>(name)
    const i = lastIndexAtOrBefore(
      list.map((c) => c.t),
      t,
    )
    return i < 0 ? undefined : list[i]
  }

  /** 登记段落。段落结尾是下一段的开头，最后一段到 duration。 */
  section(name: string, from: number, data?: Record<string, unknown>): this {
    this.sectionList.push({ name, from, data })
    this.sectionList.sort((a, b) => a.from - b.from)
    return this
  }

  get sections(): Section[] {
    return this.sectionList.map((s, i) => ({
      name: s.name,
      from: s.from,
      to: this.sectionList[i + 1]?.from ?? this.duration,
      index: i,
      data: s.data,
    }))
  }

  /** t 所在段落，带本段内的局部时间和进度。 */
  sectionAt(t: number): SectionState | undefined {
    const list = this.sections
    const i = lastIndexAtOrBefore(
      list.map((s) => s.from),
      t,
    )
    if (i < 0) return undefined
    const s = list[i]!
    const len = s.to - s.from
    return { ...s, local: t - s.from, progress: len > 0 ? clamp((t - s.from) / len) : 1 }
  }

  /** 按名字取段落。 */
  sectionNamed(name: string): Section {
    const s = this.sections.find((x) => x.name === name)
    if (!s) throw new Error(`时间轴里没有段落：${name}`)
    return s
  }

  toJSON(): TimelineJSON {
    return {
      bpm: this.bpm,
      beatsPerBar: this.beatsPerBar,
      offset: this.offset,
      duration: this.duration,
      sections: this.sections,
      cues: this.cues(),
    }
  }
}

export function timeline(opts?: TimelineOptions): Timeline {
  return new Timeline(opts)
}
