import { interpolate, spring, type SpringConfig } from '@dc/flexlayer'
import { FPS } from './timeline.js'

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const n = (v: number) => String(Math.round(v * 100) / 100)

export const ease = {
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  inCubic: (k: number) => k * k * k,
  outExpo: (k: number) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  inExpo: (k: number) => (k <= 0 ? 0 : 2 ** (10 * k - 10)),
  inOutExpo: (k: number) =>
    k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 2 ** (20 * k - 10) / 2 : (2 - 2 ** (-20 * k + 10)) / 2,
  outBack: (k: number, s = 1.7) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
  inBack: (k: number, s = 1.7) => (s + 1) * k * k * k - s * k * k,
}

/** 0 → 1 over `[from, from + length]`, shaped by `curve`. */
export function tween(frame: number, from: number, length: number, curve: (k: number) => number = ease.inOutCubic) {
  return curve(clamp01((frame - from) / length))
}

export const SNAPPY: SpringConfig = { damping: 14, stiffness: 180 }
export const BOUNCY: SpringConfig = { damping: 9, stiffness: 160 }
export const SOFT: SpringConfig = { damping: 18, stiffness: 90 }

export function pop(frame: number, from: number, config: SpringConfig = BOUNCY) {
  return spring({ frame: frame - from, fps: FPS, config })
}

/** Spring velocity in units per frame, used for squash and stretch. */
export function popVelocity(frame: number, from: number, config: SpringConfig = BOUNCY) {
  return pop(frame + 0.5, from, config) - pop(frame - 0.5, from, config)
}

export function fade(frame: number, from: number, to: number, length: number) {
  return Math.min(
    interpolate(frame, [from, from + length], [0, 1]),
    interpolate(frame, [to - length, to], [1, 0]),
  )
}

/** Deterministic noise so every render of a frame is identical. */
export function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function hex(c: string) {
  const v = parseInt(c.slice(1, 7), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const
}

export function mix(a: string, b: string, k: number) {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  const t = clamp01(k)
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0')
  return `#${to(lerp(r1, r2, t))}${to(lerp(g1, g2, t))}${to(lerp(b1, b2, t))}`
}

export function alpha(c: string, a: number) {
  return `${c.slice(0, 7)}${Math.round(clamp01(a) * 255).toString(16).padStart(2, '0')}`
}

export const PALETTE = {
  bg: '#07080c',
  panel: '#11141c',
  ink: '#f4f1ea',
  muted: '#8d97a6',
  dim: '#2a3140',
  teal: '#3ecfc4',
  blue: '#7aa2ff',
  gold: '#f5c16c',
  coral: '#ff8a7a',
  violet: '#b48cff',
  lime: '#a6e36e',
}

export const BLOCK_COLORS = [PALETTE.teal, PALETTE.blue, PALETTE.violet, PALETTE.coral, PALETTE.gold, PALETTE.lime]
