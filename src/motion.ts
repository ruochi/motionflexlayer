import { resolveEase, type Ease, type EaseName } from './ease.js'
import { clamp, lastIndexAtOrBefore, lerp } from './math.js'
import { noise1 } from './random.js'

type EaseArg = Ease | EaseName

/** t 在 [from, to] 里走过的比例，夹紧到 0..1 后过缓动。所有补间的基础。 */
export function progress(t: number, from: number, to: number, e?: EaseArg): number {
  const k = to <= from ? (t < from ? 0 : 1) : clamp((t - from) / (to - from))
  return resolveEase(e)(k)
}

/** 从 from 补到 to：progress 的值版本。 */
export function tween(t: number, from: number, to: number, a: number, b: number, e?: EaseArg): number {
  return lerp(a, b, progress(t, from, to, e))
}

/**
 * 出现窗口：[from, to] 内为 1，前后各用 fadeIn / fadeOut 秒过渡。窗口外为 0。
 * 用来管元素的整体透明度或“是否存在”。
 */
export function fade(t: number, from: number, to: number, fadeIn = 0.3, fadeOut = fadeIn, e: EaseArg = 'smoothstep'): number {
  if (t <= from || t >= to) return 0
  const f = resolveEase(e)
  const a = fadeIn > 0 ? f(clamp((t - from) / fadeIn)) : 1
  const b = fadeOut > 0 ? f(clamp((to - t) / fadeOut)) : 1
  return Math.min(a, b)
}

export type SpringConfig = {
  /** 阻尼。越小越弹。默认 12。 */
  damping?: number
  /** 刚度。越大越快。默认 170。 */
  stiffness?: number
  /** 质量。默认 1。 */
  mass?: number
  /** 初速度，单位“全程/秒”。默认 0。 */
  velocity?: number
}

/**
 * 阻尼弹簧，按秒计时。t <= 0 为 0，之后趋近 1，会过冲。
 * 解析解，任意 t 直接求值，和帧率无关，可以随机访问。
 *
 * 常用手感：
 * - 干脆不弹：{ damping: 26, stiffness: 170 }
 * - 轻微过冲：{ damping: 14, stiffness: 160 }（默认附近）
 * - 明显回弹：{ damping: 8, stiffness: 180 }
 */
export function spring(t: number, config: SpringConfig = {}): number {
  if (t <= 0) return 0
  const m = config.mass ?? 1
  const c = config.damping ?? 12
  const k = config.stiffness ?? 170
  const v0 = config.velocity ?? 0
  const w0 = Math.sqrt(k / m)
  const zeta = c / (2 * Math.sqrt(k * m))
  const x0 = -1
  let x: number
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    x = Math.exp(-zeta * w0 * t) * (x0 * Math.cos(wd * t) + ((v0 + zeta * w0 * x0) / wd) * Math.sin(wd * t))
  } else if (zeta === 1) {
    x = Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t)
  } else {
    const wd = w0 * Math.sqrt(zeta * zeta - 1)
    const a = -zeta * w0 + wd
    const b = -zeta * w0 - wd
    const c2 = (v0 - a * x0) / (b - a)
    const c1 = x0 - c2
    x = c1 * Math.exp(a * t) + c2 * Math.exp(b * t)
  }
  return 1 + x
}

/** 弹簧大致停稳（偏差 < eps）的时间，单位秒。用来排后续动作。 */
export function springDuration(config: SpringConfig = {}, eps = 0.005): number {
  let last = 0
  for (let t = 0; t < 10; t += 1 / 240) {
    if (Math.abs(spring(t, config) - 1) > eps) last = t
  }
  return last
}

export type StaggerOptions = {
  /** 相邻两个的间隔，秒。 */
  each: number
  /** 从哪里开始扩散：'start' | 'end' | 'center' | 下标。 */
  from?: 'start' | 'end' | 'center' | number
  /** 对延迟本身做缓动：先密后疏等。给出时 each × (n-1) 是总跨度。 */
  ease?: EaseArg
}

/** 第 i 个（共 n 个）的延迟秒数。 */
export function stagger(i: number, n: number, opts: StaggerOptions): number {
  const from = opts.from ?? 'start'
  const origin = from === 'start' ? 0 : from === 'end' ? n - 1 : from === 'center' ? (n - 1) / 2 : from
  const maxD = Math.max(origin, n - 1 - origin)
  const d = Math.abs(i - origin)
  if (opts.ease == null || maxD === 0) return d * opts.each
  return resolveEase(opts.ease)(d / maxD) * maxD * opts.each
}

export type Keyframe<V> = { at: number; value: V; ease?: EaseArg }

/**
 * 关键帧插值。每个关键帧的 ease 管“到达它”的那一段。首帧前、末帧后保持端值。
 * 值可以是数字或等长数字数组（位置、颜色分量）。
 */
export function keyframes<V extends number | readonly number[]>(t: number, frames: readonly Keyframe<V>[]): V {
  if (frames.length === 0) throw new Error('keyframes 至少需要一个关键帧')
  const first = frames[0]!
  if (t <= first.at) return first.value
  for (let i = 1; i < frames.length; i++) {
    const b = frames[i]!
    if (t <= b.at) {
      const a = frames[i - 1]!
      const k = progress(t, a.at, b.at, b.ease)
      if (typeof a.value === 'number') return lerp(a.value, b.value as number, k) as V
      const av = a.value as readonly number[]
      const bv = b.value as readonly number[]
      return av.map((v, j) => lerp(v, bv[j]!, k)) as unknown as V
    }
  }
  return frames[frames.length - 1]!.value
}

/** 平滑随机晃动，-amp..amp。freq 是每秒大约几次起伏。seed 区分不同的轴或元素。 */
export function wiggle(t: number, freq: number, amp: number, seed = 0, octaves = 2): number {
  let v = 0
  let a = 1
  let f = freq
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    v += noise1(t * f + seed * 17.13 + o * 31.7) * a
    norm += a
    a *= 0.5
    f *= 2
  }
  return (v / norm) * amp
}

/** 正弦往复，period 秒一周，返回 -1..1。 */
export const oscillate = (t: number, period: number, phase = 0) => Math.sin(((t / period + phase) * Math.PI * 2))

/** 距离最近一次（<= t）事件过去了多少秒。没有发生过返回 Infinity。 */
export function since(t: number, times: readonly number[]): number {
  const i = lastIndexAtOrBefore(times, t)
  return i < 0 ? Infinity : t - times[i]!
}

/**
 * 最近一次事件触发的衰减包络：命中瞬间为 1，按 exp(-decay·dt) 落下。
 * attack > 0 时有一小段线性起音，避免一帧跳变。times 必须升序。
 * 节拍脉冲、冲击闪白、镜头震动都用它，和音频用同一组时间就能对上。
 */
export function pulse(t: number, times: readonly number[], decay = 8, attack = 0): number {
  const dt = since(t, times)
  if (!Number.isFinite(dt)) return 0
  if (attack > 0 && dt < attack) return dt / attack
  return Math.exp(-(dt - attack) * decay)
}

/** 截至 t 已经发生了几次事件。用来驱动计数器、滚动数字。 */
export function count(t: number, times: readonly number[]): number {
  return lastIndexAtOrBefore(times, t) + 1
}

/**
 * 按事件分段的弹簧台阶：每发生一次事件，值从 k-1 弹到 k。
 * 返回小数，整数部分是已完成的台阶数。滚动计数器、轮播、形状切换都用它。
 */
export function springSteps(t: number, times: readonly number[], config?: SpringConfig): number {
  const i = lastIndexAtOrBefore(times, t)
  if (i < 0) return 0
  return i + spring(t - times[i]!, config)
}
