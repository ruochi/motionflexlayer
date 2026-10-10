import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AudioClip } from '../audio/types.js'
import { Timeline, type TimelineOptions } from '../timeline.js'
import { edgeTts, probeDuration, synthesizeCached, type SpokenWord, type TtsEngine } from './tts.js'

export type NarrationLine = {
  /** 段落名，也是时间轴里的 cue 名。 */
  id: string
  /** 要念的文字。字幕也用它。 */
  text: string
  /** 用录好的音频代替合成（相对 baseDir）。没有逐词时间，按字数平均估计。 */
  file?: string
  voice?: string
  rate?: string
  pitch?: string
  /** 这句开口前的留白，秒。缺省：第一句用 lead，其余用 gap。 */
  pre?: number
  /** 这句说完后画面再停多久，秒。缺省：最后一句用 tail，其余用 hold。 */
  post?: number
  /** 这一段至少多长，秒。旁白短、画面要讲清楚时用，多出来的时间加在 post 上。 */
  minDuration?: number
  /** 原样带到段落的 data 里，帧函数里从 f.section.data 取。 */
  data?: Record<string, unknown>
}

export type NarrationOptions = {
  /** 缓存和录音文件的基准目录。传 import.meta.url 或目录路径。 */
  baseDir: string | URL
  /** 缓存目录，相对 baseDir。默认 'voice'。提交进仓库，离线也能重现。 */
  cacheDir?: string
  /** 默认 zh-CN-XiaoxiaoNeural。edge-tts --list-voices 查看全部。 */
  voice?: string
  rate?: string
  pitch?: string
  engine?: TtsEngine
  /** 缓存里没有时报错，不联网。缺省读环境变量 MFL_TTS_OFFLINE=1。 */
  offline?: boolean
  /** 片头留白，秒。默认 0.6。 */
  lead?: number
  /** 句间留白，秒。默认 0.35。 */
  gap?: number
  /** 句后停留，秒。默认 0.25。 */
  hold?: number
  /** 片尾停留，秒。默认 1.2。 */
  tail?: number
}

/** 时间轴上的一个词。from、to 是全片时间；start、end 是它在 text 里的字符位置（含紧跟的标点）。 */
export type PlannedWord = { text: string; from: number; to: number; start: number; end: number; index: number }

export type PlannedLine = {
  id: string
  text: string
  index: number
  /** 段落起止（含留白），秒。相邻段落首尾相接。 */
  from: number
  to: number
  /** 开口和收声的时刻，秒。 */
  speechFrom: number
  speechTo: number
  /** 音频文件的绝对路径。 */
  file: string
  words: PlannedWord[]
  /** 逐词时间是估计的（录音文件没有对齐数据）。 */
  estimated: boolean
  data?: Record<string, unknown>
}

/** 字幕里的一个词。只有文字和时间，没有颜色、字号、位置。 */
export type SubtitleWord = { text: string; from: number; to: number; start: number; end: number }

/**
 * 字幕里的一个码点。时间是从所在词均分来的；标点不占时长，`from === to`，跟前一个字一起结束。
 * 没有颜色、字号、位置。怎么画由画面自己决定。
 */
export type SubtitleChar = {
  text: string
  /** 在这句里的码点序号，和 `drawGlyphs` 的字形序号一致。 */
  index: number
  /** 在 `text` 里的 UTF-16 区间。 */
  start: number
  end: number
  from: number
  to: number
  /** 所在词的序号。引擎没对上的字没有。 */
  word?: number
}

export type SubtitleLine = {
  id: string
  text: string
  index: number
  from: number
  to: number
  speechFrom: number
  speechTo: number
  words: SubtitleWord[]
  chars: SubtitleChar[]
}

/** 整条字幕轨。可以交给别的渲染器，也可以写进合成的 `subtitles`。 */
export type SubtitleTrack = { lines: SubtitleLine[] }

/** 某一帧的字幕。`progress` 是这个词、这个字自己的 0..1，不含任何样式。 */
export type SubtitleNow = {
  line: SubtitleLine
  words: Array<SubtitleWord & { progress: number }>
  chars: Array<SubtitleChar & { progress: number }>
}

const PUNCT = /[\s，。、；：？！,.;:?!…—\-·「」『』“”"'（）()《》]/
const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/** 把一句的逐词时间拆成逐字时间。 */
export function subtitleChars(text: string, words: PlannedWord[]): SubtitleChar[] {
  const points: Array<{ text: string; start: number; end: number; index: number }> = []
  let utf = 0
  let index = 0
  for (const ch of text) {
    points.push({ text: ch, start: utf, end: utf + ch.length, index })
    utf += ch.length
    index++
  }
  const wordAt = points.map((p) => words.findIndex((w) => p.start >= w.start && p.start < w.end))
  const out: SubtitleChar[] = points.map((p, i) => {
    const wi = wordAt[i]!
    if (wi < 0) return { ...p, from: 0, to: 0 }
    const w = words[wi]!
    if (PUNCT.test(p.text)) return { ...p, from: w.to, to: w.to, word: wi }
    const spoken = points.filter((q, j) => wordAt[j] === wi && !PUNCT.test(q.text))
    const ord = spoken.findIndex((q) => q.index === p.index)
    const n = Math.max(1, spoken.length)
    const from = w.from + (ord * (w.to - w.from)) / n
    const to = ord === spoken.length - 1 ? w.to : w.from + ((ord + 1) * (w.to - w.from)) / n
    return { ...p, from: r4(from), to: r4(to), word: wi }
  })
  for (let i = 0; i < out.length; i++) {
    if (out[i]!.word != null) continue
    const next = out.slice(i + 1).find((c) => c.word != null)
    let prev: SubtitleChar | undefined
    for (let j = i - 1; j >= 0; j--) if (out[j]!.word != null) { prev = out[j]; break }
    const t = next ? words[next.word!]!.from : (prev?.to ?? words[0]?.from ?? 0)
    out[i]!.from = t
    out[i]!.to = t
  }
  return out
}

export function subtitleTrack(lines: PlannedLine[]): SubtitleTrack {
  return {
    lines: lines.map((l) => ({
      id: l.id,
      text: l.text,
      index: l.index,
      from: l.from,
      to: l.to,
      speechFrom: l.speechFrom,
      speechTo: l.speechTo,
      words: l.words.map((w) => ({ text: w.text, from: w.from, to: w.to, start: w.start, end: w.end })),
      chars: subtitleChars(l.text, l.words),
    })),
  }
}

/** 这个字念到哪。标点（from === to）在那一刻直接是 1。 */
export function charProgress(ch: { from: number; to: number }, t: number): number {
  if (t < ch.from) return 0
  if (!(ch.to > ch.from)) return 1
  return Math.min(1, (t - ch.from) / (ch.to - ch.from))
}

/** t 所在那一句的逐字读数。t 在第一句之前时没有。 */
export function subtitleAt(track: SubtitleTrack, t: number): SubtitleNow | undefined {
  let line: SubtitleLine | undefined
  for (const l of track.lines) if (l.from <= t + 1e-9) line = l
  if (!line) return undefined
  return {
    line,
    words: line.words.map((w) => ({ ...w, progress: charProgress(w, t) })),
    chars: line.chars.map((ch) => ({ ...ch, progress: charProgress(ch, t) })),
  }
}

/** 字所在那个词的进度；引擎没对上词的字（开头的引号）用它自己的进度，时间和下一个词的开口一样。 */
export function wordProgress(now: SubtitleNow, ch: SubtitleChar & { progress: number }): number {
  return ch.word != null ? (now.words[ch.word]?.progress ?? ch.progress) : ch.progress
}

const vttTime = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor(ms / 60000) % 60
  const s = Math.floor(ms / 1000) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

/** WebVTT。一句一条，只有文字和时间，没有样式块。开口到这一段结束（含句后停留）。 */
export function toVtt(track: SubtitleTrack): string {
  const cues = track.lines.filter((l) => l.text.trim() && l.to > l.speechFrom)
  const body = cues.map((l, i) => `${i + 1}\n${vttTime(l.speechFrom)} --> ${vttTime(l.to)}\n${l.text}`).join('\n\n')
  return `WEBVTT\n\n${body}\n`
}

/** 把引擎给的词对回原文的字符位置。引擎会丢掉标点，也可能改写数字，对不上的词占一个空位。 */
export function alignWords(text: string, words: SpokenWord[], offset: number): PlannedWord[] {
  let cursor = 0
  const out = words.map((w, index) => {
    const at = text.indexOf(w.text, cursor)
    const start = at >= 0 ? at : cursor
    const end = at >= 0 ? at + w.text.length : cursor
    cursor = end
    return { text: w.text, from: offset + w.from, to: offset + w.to, start, end, index }
  })
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1]?.start ?? text.length
    let e = out[i]!.end
    while (e < next && PUNCT.test(text[e]!)) e++
    out[i]!.end = e
  }
  return out
}

/** 没有逐词时间的录音：按字数把时长平均分给每个字。 */
function estimateWords(text: string, duration: number): SpokenWord[] {
  const chars = [...text].filter((c) => !PUNCT.test(c))
  const per = duration / Math.max(1, chars.length)
  return chars.map((c, i) => ({ text: c, from: i * per, to: (i + 1) * per }))
}

/**
 * 旁白：先念出来，再按念出来的长度排时间。
 *
 * 每句一段：留白（pre）→ 说话 → 停留（post），段落首尾相接。全片时长、段落、cue 都从这里来，
 * 画面按段落编排，音乐按段落起伏，字幕是逐字时间、不带样式。改了文案只要重跑，时间全部跟着变。
 */
export class Narration {
  readonly subtitles: SubtitleTrack

  constructor(
    readonly lines: PlannedLine[],
    readonly duration: number,
  ) {
    this.subtitles = subtitleTrack(lines)
  }

  line(id: string): PlannedLine {
    const l = this.lines.find((x) => x.id === id)
    if (!l) throw new Error(`旁白里没有这一句：${id}`)
    return l
  }

  /** t 所在的那一句（按段落算，留白也算在内）。 */
  lineAt(t: number): PlannedLine | undefined {
    let found: PlannedLine | undefined
    for (const l of this.lines) if (l.from <= t) found = l
    return found
  }

  /** 这一句里第 nth 个含 text 的词。找不到就报错：改了文案，动作该跟着改。 */
  word(id: string, text: string, nth = 0): PlannedWord {
    const w = this.line(id).words.filter((x) => x.text.includes(text))[nth]
    if (!w) throw new Error(`旁白 ${id} 里没有第 ${nth + 1} 个含“${text}”的词`)
    return w
  }

  /** 这一句里第 nth 个含 text 的词开口的时刻。画面动作卡在词上，改了文案、换了音色都跟着走。 */
  at(id: string, text: string, nth = 0): number {
    return this.word(id, text, nth).from
  }

  /** 全部词，按时间排。 */
  get words(): PlannedWord[] {
    return this.lines.flatMap((l) => l.words)
  }

  /** 这一帧的字幕：每个字的文字和时间，没有颜色、字号、位置。 */
  subtitle(t: number): SubtitleNow | undefined {
    return subtitleAt(this.subtitles, t)
  }

  /** 旁白片段，放进 audio.clips。默认进 'voice' 母线，音乐用 duck.by: 'voice' 给它让路。 */
  clips(opts: { bus?: string; gain?: number } = {}): AudioClip[] {
    return this.lines.map((l) => ({ src: l.file, at: l.speechFrom, bus: opts.bus ?? 'voice', gain: opts.gain, label: l.id }))
  }

  /**
   * 登记到时间轴：每句一个段落（名字是 id），开口处一个同名 cue，
   * 另有 'line'（每句开口）和 'word'（每个词开口）两组 cue。
   * 这些 cue 带 audit: false，音频报告不拿它们检查音效是否落点。
   */
  apply(tl: Timeline): Timeline {
    for (const l of this.lines) {
      tl.section(l.id, l.from, { text: l.text, ...l.data })
      tl.cue(l.id, l.speechFrom, { text: l.text, audit: false })
      tl.cue('line', l.speechFrom, { id: l.id, audit: false })
      for (const w of l.words) tl.cue('word', w.from, { line: l.id, text: w.text, audit: false })
    }
    if (!(tl.duration > 0)) tl.duration = this.duration
    return tl
  }

  /** 新建一条时间轴并登记旁白。音乐有拍速时传 bpm。 */
  timeline(opts: Omit<TimelineOptions, 'duration'> = {}): Timeline {
    return this.apply(new Timeline({ ...opts, duration: this.duration }))
  }
}

const dirOf = (base: string | URL) => {
  const p = base instanceof URL || base.startsWith('file:') ? fileURLToPath(base) : base
  return /\.[cm]?[jt]sx?$/.test(p) ? resolve(p, '..') : p
}

/** 合成（或读缓存）全部旁白，排出时间。 */
export async function narration(lines: NarrationLine[], opts: NarrationOptions): Promise<Narration> {
  if (lines.length === 0) throw new Error('旁白至少要有一句')
  const ids = new Set<string>()
  for (const l of lines) {
    if (ids.has(l.id)) throw new Error(`旁白 id 重复：${l.id}`)
    ids.add(l.id)
  }
  const baseDir = dirOf(opts.baseDir)
  const cacheDir = resolve(baseDir, opts.cacheDir ?? 'voice')
  const engine = opts.engine ?? edgeTts
  const offline = opts.offline ?? process.env.MFL_TTS_OFFLINE === '1'
  const lead = opts.lead ?? 0.6
  const gap = opts.gap ?? 0.35
  const hold = opts.hold ?? 0.25
  const tail = opts.tail ?? 1.2

  const spoken = await Promise.all(
    lines.map(async (l) => {
      if (l.file) {
        const file = isAbsolute(l.file) ? l.file : resolve(baseDir, l.file)
        const duration = await probeDuration(file)
        return { file, duration, words: estimateWords(l.text, duration), estimated: true }
      }
      const res = await synthesizeCached(
        { text: l.text, voice: l.voice ?? opts.voice ?? 'zh-CN-XiaoxiaoNeural', rate: l.rate ?? opts.rate, pitch: l.pitch ?? opts.pitch },
        { engine, cacheDir, offline },
      )
      return { ...res, estimated: false }
    }),
  )

  let cursor = 0
  const planned = lines.map((l, i): PlannedLine => {
    const s = spoken[i]!
    const pre = l.pre ?? (i === 0 ? lead : gap)
    const post = l.post ?? (i === lines.length - 1 ? tail : hold)
    const from = cursor
    const speechFrom = from + pre
    const speechTo = speechFrom + s.duration
    const to = Math.max(speechTo + post, from + (l.minDuration ?? 0))
    cursor = to
    const r = (v: number) => Math.round(v * 1e4) / 1e4
    return {
      id: l.id,
      text: l.text,
      index: i,
      from: r(from),
      to: r(to),
      speechFrom: r(speechFrom),
      speechTo: r(speechTo),
      file: s.file,
      words: alignWords(l.text, s.words, r(speechFrom)),
      estimated: s.estimated,
      data: l.data,
    }
  })
  return new Narration(planned, planned[planned.length - 1]!.to)
}
