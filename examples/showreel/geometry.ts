import { CENTER, GEO_WINDUP, MORPHS, kickEnv } from './timeline.js'
import { TAU, easeInCubic, lastIndexAtOrBefore, lerp, springT, unlerp, type Vec } from './compat.js'

const MORPH_TIMES = MORPHS.map((m) => m.t)
const SIZE: Record<number, number> = { 0: 200, 3: 262, 4: 232, 6: 214 }
const SPIN: Record<number, number> = { 0: 0, 3: (120 * Math.PI) / 180, 4: Math.PI, 6: (240 * Math.PI) / 180 }
/** 正方形平顶，其余顶点朝上。 */
const VERTEX: Record<number, number> = { 0: 0, 3: -Math.PI / 2, 4: -Math.PI / 2 + Math.PI / 4, 6: -Math.PI / 2 }

export const ECHO_SCALE = [1, 0.74, 0.5, 0.28]
export const ECHO_LAG = 0.07

/** 角度 th 处 k 边形的半径；k = 0 是圆。 */
export function shapeRadius(sides: number, th: number): number {
  const R = SIZE[sides]!
  if (sides === 0) return R
  const a = TAU / sides
  let local = (th - VERTEX[sides]!) % a
  if (local < 0) local += a
  return (R * Math.cos(Math.PI / sides)) / Math.cos(local - Math.PI / sides)
}

export type GeoState = { prev: number; cur: number; p: number; rot: number; scale: number }

/** 第 j 层回声在 t 时刻的形状状态。 */
export function geoState(t: number, j: number): GeoState {
  const lt = t - j * ECHO_LAG
  const m = Math.max(0, lastIndexAtOrBefore(MORPH_TIMES, lt))
  const cur = MORPHS[m]!.sides
  const prev = m > 0 ? MORPHS[m - 1]!.sides : 0
  const p = m > 0 ? springT(lt - MORPHS[m]!.t, 11, 150) : 1
  let rot = lerp(SPIN[prev]!, SPIN[cur]!, p) - j * 0.12 * (1 - Math.min(1, p))
  const windup = easeInCubic(unlerp(t, GEO_WINDUP, 16))
  rot += windup * Math.PI * 0.9 * (1 + j * 0.15)
  const bloom = j === 0 ? 1 : springT(t - 8 - j * 0.09, 10, 120)
  const scale = ECHO_SCALE[j]! * bloom * (1 + 0.035 * kickEnv(t)) * (1 - 0.14 * windup)
  return { prev, cur, p, rot, scale }
}

export function contour(t: number, j: number, count = 240): Vec[] {
  const s = geoState(t, j)
  const out: Vec[] = []
  for (let i = 0; i < count; i++) {
    const th = (i / count) * TAU
    const r = lerp(shapeRadius(s.prev, th), shapeRadius(s.cur, th), s.p) * s.scale
    const a = th + s.rot
    out.push([CENTER[0] + r * Math.cos(a), CENTER[1] + r * Math.sin(a)])
  }
  return out
}

/** 当前外形的顶点（圆没有顶点）。 */
export function vertices(t: number, j: number): Vec[] {
  const s = geoState(t, j)
  if (s.cur === 0) return []
  const out: Vec[] = []
  for (let k = 0; k < s.cur; k++) {
    const th = VERTEX[s.cur]! + (k / s.cur) * TAU
    const r = lerp(shapeRadius(s.prev, th), shapeRadius(s.cur, th), s.p) * s.scale
    const a = th + s.rot
    out.push([CENTER[0] + r * Math.cos(a), CENTER[1] + r * Math.sin(a)])
  }
  return out
}
