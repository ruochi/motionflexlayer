export const TAU = Math.PI * 2

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** lerp 的反函数，不夹紧。 */
export const invLerp = (a: number, b: number, v: number) => (a === b ? (v < a ? 0 : 1) : (v - a) / (b - a))

/** 把 v 从 [a0, a1] 映射到 [b0, b1]，默认夹紧。 */
export function remap(v: number, a0: number, a1: number, b0: number, b1: number, clamped = true): number {
  const k = invLerp(a0, a1, v)
  return lerp(b0, b1, clamped ? clamp(k) : k)
}

export const lerp2 = (a: Vec2, b: Vec2, k: number): Vec2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]
export const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1])
export const deg = (rad: number) => (rad * 180) / Math.PI
export const rad = (degrees: number) => (degrees * Math.PI) / 180

/** 角度之间走最短路插值，单位度。 */
export function lerpAngle(a: number, b: number, k: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return a + d * k
}

/** 两位小数。写进属性的数一律过一遍，避免 1e-17 之类的长串。 */
export const r2 = (v: number) => Math.round(v * 100) / 100

/** 升序数组里最后一个 <= v 的下标，没有返回 -1。 */
export function lastIndexAtOrBefore(sorted: readonly number[], v: number): number {
  let lo = 0
  let hi = sorted.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid]! <= v) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** [from, to) 内步长为 step 的等差序列，避免累加误差。 */
export function range(from: number, to: number, step = 1): number[] {
  const out: number[] = []
  const n = Math.ceil((to - from) / step - 1e-9)
  for (let i = 0; i < n; i++) out.push(from + i * step)
  return out
}
