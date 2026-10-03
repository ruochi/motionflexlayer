import { clamp } from './math.js'

export type Ease = (x: number) => number

const outOf = (f: Ease): Ease => (x) => 1 - f(1 - x)
const inOutOf = (f: Ease): Ease => (x) => (x < 0.5 ? f(x * 2) / 2 : 1 - f((1 - x) * 2) / 2)

const quad: Ease = (x) => x * x
const cubic: Ease = (x) => x * x * x
const quart: Ease = (x) => x ** 4
const quint: Ease = (x) => x ** 5
const sine: Ease = (x) => 1 - Math.cos((x * Math.PI) / 2)
const expo: Ease = (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10))
const circ: Ease = (x) => 1 - Math.sqrt(1 - x * x)

/** 超出量 s 越大，回拉越明显。1.70158 约为 10% 过冲。 */
export const backIn = (s = 1.70158): Ease => (x) => x * x * ((s + 1) * x - s)

/**
 * CSS cubic-bezier(x1, y1, x2, y2)。x 用牛顿迭代反解，失败时二分。
 * 和设计稿、AE 曲线对齐时用它。
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u
  const sy = (u: number) => ((ay * u + by) * u + cy) * u
  const dsx = (u: number) => (3 * ax * u + 2 * bx) * u + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let u = x
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x
      if (Math.abs(err) < 1e-6) return sy(u)
      const d = dsx(u)
      if (Math.abs(d) < 1e-6) break
      u -= err / d
    }
    let lo = 0
    let hi = 1
    u = x
    for (let i = 0; i < 30; i++) {
      const v = sx(u)
      if (Math.abs(v - x) < 1e-6) break
      if (v < x) lo = u
      else hi = u
      u = (lo + hi) / 2
    }
    return sy(u)
  }
}

/** 阶梯，帧动画、打字机、定格感用。 */
export const steps = (n: number): Ease => (x) => Math.min(n, Math.floor(clamp(x) * n)) / n

export const ease = {
  linear: ((x) => x) as Ease,
  inQuad: quad,
  outQuad: outOf(quad),
  inOutQuad: inOutOf(quad),
  inCubic: cubic,
  outCubic: outOf(cubic),
  inOutCubic: inOutOf(cubic),
  inQuart: quart,
  outQuart: outOf(quart),
  inOutQuart: inOutOf(quart),
  inQuint: quint,
  outQuint: outOf(quint),
  inOutQuint: inOutOf(quint),
  inSine: sine,
  outSine: outOf(sine),
  inOutSine: inOutOf(sine),
  inExpo: expo,
  outExpo: outOf(expo),
  inOutExpo: inOutOf(expo),
  inCirc: circ,
  outCirc: outOf(circ),
  inOutCirc: inOutOf(circ),
  inBack: backIn(),
  outBack: outOf(backIn()),
  inOutBack: inOutOf(backIn(1.70158 * 1.525)),
  /** 苹果式的“快进慢停”。 */
  smooth: cubicBezier(0.25, 0.1, 0.25, 1),
  /** Material 标准曲线。 */
  standard: cubicBezier(0.2, 0, 0, 1),
  /** 起势重、收得急，适合入场强调。 */
  emphasized: cubicBezier(0.3, 0, 0, 1),
  smoothstep: ((x) => x * x * (3 - 2 * x)) as Ease,
  smootherstep: ((x) => x * x * x * (x * (x * 6 - 15) + 10)) as Ease,
} as const

export type EaseName = keyof typeof ease

export function resolveEase(e: Ease | EaseName | undefined): Ease {
  if (e == null) return ease.linear
  return typeof e === 'function' ? e : ease[e]
}
