import { clamp } from './math.js'

export type RGBA = [number, number, number, number]

/** 解析 #rgb / #rgba / #rrggbb / #rrggbbaa。分量 0..255，alpha 0..1。 */
export function parseHex(hex: string): RGBA {
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) throw new Error(`不是十六进制颜色：${hex}`)
  const n = (k: number) => parseInt(s.slice(k, k + 2), 16)
  return [n(0), n(2), n(4), s.length === 8 ? n(6) / 255 : 1]
}

const h2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')

/** 输出 #rrggbb，alpha < 1 时输出 #rrggbbaa。flexlayer 属性和 canvas 都认。 */
export function toHex([r, g, b, a = 1]: readonly number[]): string {
  const base = `#${h2(r!)}${h2(g!)}${h2(b!)}`
  return a >= 1 ? base : base + h2(a * 255)
}

/** 两个十六进制颜色按 k 混合，返回十六进制。 */
export function mixColor(a: string, b: string, k: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  const kk = clamp(k)
  return toHex(x.map((v, i) => v + (y[i]! - v) * kk))
}

/** 沿一串颜色均匀取色，k ∈ 0..1。渐变、热力、按进度换色。 */
export function colorRamp(stops: readonly string[], k: number): string {
  if (stops.length === 1) return stops[0]!
  const x = clamp(k) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return mixColor(stops[i]!, stops[i + 1]!, x - i)
}

/** 十六进制颜色换透明度，返回 rgba() 字符串。canvas 里画半透明用。 */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b, a] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp(alpha * a) * 1000) / 1000})`
}
