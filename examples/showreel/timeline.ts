import { pulse, timeline } from 'motionflexlayer'
import { TAU, clamp, type Vec } from './compat.js'

export const W = 1920
export const H = 1080
export const DURATION = 48
export const CENTER: Vec = [W / 2, H / 2]

/**
 * 全片唯一的时间来源。画面读 tl.times(...) 做脉冲、震动；音频在同样的时间放鼓、冲击、侧链。
 * 120 BPM，一小节 2 秒，每段 4 小节 = 8 秒。
 */
export const tl = timeline({ bpm: 120, duration: DURATION })
  .section('起笔', 0, { index: '01', en: 'INK' })
  .section('几何', 8, { index: '02', en: 'GEOMETRY' })
  .section('粒子', 16, { index: '03', en: 'FLOW' })
  .section('版式', 24, { index: '04', en: 'LAYOUT' })
  .section('空间', 32, { index: '05', en: 'SPACE' })
  .section('落款', 40, { index: '06', en: 'SIGNATURE' })

export const BPM = tl.bpm
export const BEAT = tl.beatLength
export const BAR = tl.barLength

// 底鼓：02–03 段四拍一下，粒子成字那一小节空出来；04、05 段继续；落款一记
tl.cue('kick', [...tl.beats(16, 46), ...tl.beats(48, 64), ...tl.beats(64, 79), tl.bar(20)])

// 重击：画面震动、闪光，声音里的 impact。amp 是震动幅度（像素）
for (const [bar, amp] of [[4, 7], [8, 12], [12, 7], [16, 16], [20, 22]] as const) tl.cue('impact', tl.bar(bar), { amp })

export const SECTIONS = tl.sections.map((s) => ({
  from: s.from,
  index: s.data!.index as string,
  name: s.name,
  en: s.data!.en as string,
}))

/** 底鼓时间。画面的脉冲和声音的底鼓、侧链都读这一份。 */
export const KICKS = tl.times('kick')

export const kickEnv = (t: number, decay = 7) => pulse(t, KICKS, decay)

export const IMPACTS = tl.cues<{ amp: number }>('impact').map((c) => ({ t: c.t, amp: c.data!.amp }))

// ---------- 01 起笔 ----------
export const PEN_FROM = 1.6
export const PEN_TO = 8
export const RING_R = 200

/** 毛笔路径：两个连笔圈 → S 形过渡 → 一整圈圆，终点回到圆的底部。 */
function buildPenPath(): { pts: Vec[]; len: number[]; circleFrom: number } {
  const pts: Vec[] = []
  const r = 50
  const d = 92
  const X0 = 150
  const Yb = 800
  for (let i = 0; i <= 600; i++) {
    const phi = Math.PI + (i / 600) * 4 * Math.PI
    pts.push([X0 + r * (phi - Math.PI) - d * Math.sin(phi), Yb - d * Math.cos(phi)])
  }
  const e1 = pts[pts.length - 1]!
  const c0: Vec = [CENTER[0], CENTER[1] + RING_R]
  const p1: Vec = [e1[0] + 170, e1[1]]
  const p2: Vec = [c0[0] - 170, c0[1]]
  for (let i = 1; i <= 200; i++) {
    const u = i / 200
    const a = (1 - u) ** 3
    const b = 3 * (1 - u) ** 2 * u
    const c = 3 * (1 - u) * u * u
    const dd = u ** 3
    pts.push([
      a * e1[0] + b * p1[0] + c * p2[0] + dd * c0[0],
      a * e1[1] + b * p1[1] + c * p2[1] + dd * c0[1],
    ])
  }
  const circleStart = pts.length - 1
  for (let i = 1; i <= 720; i++) {
    const th = Math.PI / 2 - (i / 720) * TAU
    pts.push([CENTER[0] + RING_R * Math.cos(th), CENTER[1] + RING_R * Math.sin(th)])
  }
  const len = [0]
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!
    const [bx, by] = pts[i]!
    len.push(len[i - 1]! + Math.hypot(bx - ax, by - ay))
  }
  return { pts, len, circleFrom: len[circleStart]! }
}

export const PEN = buildPenPath()
export const PEN_LEN = PEN.len[PEN.len.length - 1]!

/** 笔走过的弧长比例：起笔慢、中段快、收笔慢。 */
export function penProgress(t: number): number {
  const x = clamp((t - PEN_FROM) / (PEN_TO - PEN_FROM))
  return x - (0.62 * Math.sin(TAU * x)) / TAU
}

export function penSpeed(t: number): number {
  const dt = 1 / 240
  return ((penProgress(t + dt) - penProgress(t - dt)) / (2 * dt)) * PEN_LEN
}

/** 弧长 s（像素）处的点与切线。 */
export function penAt(s: number): { p: Vec; dir: Vec } {
  const { pts, len } = PEN
  const target = clamp(s, 0, PEN_LEN)
  let lo = 0
  let hi = len.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (len[mid]! <= target) lo = mid
    else hi = mid
  }
  const seg = len[hi]! - len[lo]! || 1
  const k = (target - len[lo]!) / seg
  const a = pts[lo]!
  const b = pts[hi]!
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const m = Math.hypot(dx, dy) || 1
  return { p: [a[0] + dx * k, a[1] + dy * k], dir: [dx / m, dy / m] }
}

/** 笔尖经过弧长 s 的时刻。 */
export function penTimeAt(s: number): number {
  const target = clamp(s / PEN_LEN)
  let lo = PEN_FROM
  let hi = PEN_TO
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (penProgress(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** 开场钟声：每个音落下时笔尖闪一下。 */
export const INTRO_BELLS: Array<{ t: number; midi: number }> = [
  { t: 2.0, midi: 69 },
  { t: 3.0, midi: 76 },
  { t: 4.0, midi: 72 },
  { t: 4.5, midi: 71 },
  { t: 5.0, midi: 69 },
  { t: 6.0, midi: 67 },
  { t: 6.5, midi: 69 },
  { t: 7.0, midi: 76 },
]

// ---------- 02 几何 ----------
export const MORPHS = [
  { t: 8, sides: 0, label: '∞' },
  { t: 10, sides: 3, label: '03' },
  { t: 12, sides: 4, label: '04' },
  { t: 14, sides: 6, label: '06' },
]
export const RIPPLES = [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
export const GEO_WINDUP = 15.5

// ---------- 03 粒子 ----------
export const BURST = 16
export const CONVERGE_FROM = 19.4
export const CONVERGE_DUR = 1.5
export const CONVERGE_SPREAD = 1.6
export const FORMED = 23
export const SCATTER = 24

// ---------- 04 版式 ----------
export const CARD_TIMES = [24.0, 24.5, 25.0, 25.5]
export const CARD_LAND = 0.12
export const HEADLINE = '一个 <draw>，任意画面'
export const HEADLINE_FROM = 26.0
export const HEADLINE_STEP = 0.125
export const CARD_WAVE = [28.0, 28.25, 28.5, 28.75]
export const ZOOM_FROM = 30.5
export const ZOOM_TO = 32

export function headlineCharTimes(): number[] {
  const out: number[] = []
  let k = 0
  for (const ch of HEADLINE) {
    out.push(HEADLINE_FROM + k * HEADLINE_STEP)
    if (ch !== ' ') k++
  }
  return out
}

// ---------- 05 空间 ----------
export const SPACE_MORPHS = [32, 34, 36, 38]
export const IMPLODE_FROM = 38.6
export const IMPLODE_TO = 39.75

// ---------- 06 落款 ----------
export const TITLE_FROM = 40.25
export const SUB_FROM = 41.0
export const UNDERLINE_FROM = 42.0
export const UNDERLINE_TO = 43.2
export const CODE = '<draw> ctx.fillRect(0, 0, el.w, el.h) </draw>'
export const CODE_FROM = 43.6
export const CODE_STEP = 0.036
export const URL_FROM = 45.3
export const GLINT = 46.0
export const FADE_FROM = 46.6

export function codeCharTimes(): number[] {
  const out: number[] = []
  for (let i = 0; i < CODE.length; i++) out.push(CODE_FROM + i * CODE_STEP)
  return out
}

export const OUTRO_BELLS: Array<{ t: number; midi: number }> = [
  { t: 41.0, midi: 69 },
  { t: 41.75, midi: 76 },
  { t: 42.5, midi: 72 },
  { t: 43.0, midi: 71 },
  { t: 43.5, midi: 69 },
  { t: 44.5, midi: 67 },
  { t: 45.0, midi: 69 },
]

// 关键事件也登记成 cue：音频报告按 cue 检查“这个点上有没有声音进来”，波形图上也会标出来
tl.cue('morph', MORPHS.slice(1).map((m) => m.t))
  .cue('burst', [BURST])
  .cue('formed', [FORMED])
  .cue('card', CARD_TIMES)
  .cue('zoom', [ZOOM_FROM])
  .cue('space-morph', SPACE_MORPHS.slice(1))
  .cue('title', [TITLE_FROM])
  .cue('glint', [GLINT])
