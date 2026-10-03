/**
 * showreel 的绘制代码写在框架之前，沿用了一套旧名字。这里把旧名字接到框架 API 上，
 * 绘制代码一行不改。新项目直接用 motionflexlayer 的 progress / fade / spring / ease。
 */
import {
  clamp,
  ease,
  fade,
  invLerp,
  mixColor,
  progress,
  r2,
  rng,
  spring,
  type Ease,
  type Vec2,
} from 'motionflexlayer'

export { TAU, clamp, lerp, lastIndexAtOrBefore, range, rgba, simplex3, noise1 } from 'motionflexlayer'

export type Vec = Vec2

export const unlerp = (v: number, a: number, b: number) => clamp(invLerp(a, b, v))
export const smooth = ease.smoothstep
export const easeOutCubic = ease.outCubic
export const easeInCubic = ease.inCubic
export const easeInOutCubic = ease.inOutCubic
export const easeOutExpo = ease.outExpo
export const easeInExpo = ease.inExpo
export const easeOutBack = (v: number, s = 1.7) => 1 + (s + 1) * (v - 1) ** 3 + s * (v - 1) ** 2

/** = progress(t, a, b, e)，默认 smoothstep。 */
export const span = (t: number, a: number, b: number, e: Ease = smooth) => progress(t, a, b, e)
/** = fade(t, a, b, fadeIn, fadeOut)。 */
export const window = (t: number, a: number, b: number, fadeIn: number, fadeOut = fadeIn) => fade(t, a, b, fadeIn, fadeOut)
/** = spring(t, { damping, stiffness, mass })。 */
export const springT = (t: number, damping = 12, stiffness = 170, mass = 1) => spring(t, { damping, stiffness, mass })

export const mulberry32 = rng
/** 接受小数输入的旧哈希。整数下标的固定随机属性用框架的 hash(i, seed)。 */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
export const mixHex = mixColor
export const n2 = (v: number) => String(r2(v))
