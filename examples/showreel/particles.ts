import { DEFAULT_FONT, createCanvas } from 'motionflexlayer'
import { contour } from './geometry.js'
import {
  BURST,
  CENTER,
  CONVERGE_DUR,
  CONVERGE_FROM,
  CONVERGE_SPREAD,
  FORMED,
  H,
  SCATTER,
  W,
} from './timeline.js'
import { clamp, easeInOutCubic, mixHex, mulberry32, noise1, simplex3, type Vec } from './compat.js'

export const N = 2400
export const SIM_HZ = 120
const SIM_END = SCATTER
const STEPS = Math.ceil((SIM_END - BURST) * SIM_HZ)

export const LAYER_COLORS = ['#f4f1ea', '#4fd1ff', '#8b7bff', '#ff5d73']
const TEXT_LEFT = '#ffcf7a'
const TEXT_RIGHT = '#ff6a7f'

export const TEXT = '<draw>'
export const TEXT_FONT = `800 300px ${DEFAULT_FONT}`
export const TEXT_Y = 520

const rnd = mulberry32(2024)

const layer = new Uint8Array(N)
const rand = new Float32Array(N * 4)
for (let i = 0; i < N; i++) {
  const u = rnd()
  layer[i] = u < 0.4 ? 0 : u < 0.67 ? 1 : u < 0.86 ? 2 : 3
  for (let k = 0; k < 4; k++) rand[i * 4 + k] = rnd()
}

const sim = new Float32Array((STEPS + 1) * N * 2)

function simulate() {
  const outlines = [0, 1, 2, 3].map((j) => contour(BURST - 1e-3, j, 480))
  const pos = new Float32Array(N * 2)
  const vel = new Float32Array(N * 2)
  for (let i = 0; i < N; i++) {
    const outline = outlines[layer[i]!]!
    const p = outline[Math.floor(rand[i * 4]! * outline.length)]!
    pos[i * 2] = p[0]
    pos[i * 2 + 1] = p[1]
    const dx = p[0] - CENTER[0]
    const dy = p[1] - CENTER[1]
    const m = Math.hypot(dx, dy) || 1
    const speed = 260 + 900 * rand[i * 4 + 1]! ** 2
    const swirl = (rand[i * 4 + 2]! - 0.5) * 420
    vel[i * 2] = (dx / m) * speed - (dy / m) * swirl
    vel[i * 2 + 1] = (dy / m) * speed + (dx / m) * swirl
  }
  sim.set(pos, 0)
  const dt = 1 / SIM_HZ
  const s = 0.0021
  const e = 0.02
  for (let step = 1; step <= STEPS; step++) {
    const t = BURST + step * dt
    const z = t * 0.13
    for (let i = 0; i < N; i++) {
      const x = pos[i * 2]!
      const y = pos[i * 2 + 1]!
      const nx = x * s
      const ny = y * s
      const dndy = (simplex3(nx, ny + e, z) - simplex3(nx, ny - e, z)) / (2 * e)
      const dndx = (simplex3(nx + e, ny, z) - simplex3(nx - e, ny, z)) / (2 * e)
      const dx = x - CENTER[0]
      const dy = y - CENTER[1]
      let fx = dndy * 95 - dy * 0.07
      let fy = -dndx * 95 + dx * 0.07
      const q = (dx / 820) ** 2 + (dy / 410) ** 2
      if (q > 1) {
        fx -= dx * (q - 1) * 1.6
        fy -= dy * (q - 1) * 1.6
      }
      let vx = vel[i * 2]!
      let vy = vel[i * 2 + 1]!
      vx += (fx - vx) * 1.5 * dt
      vy += (fy - vy) * 1.5 * dt
      vel[i * 2] = vx
      vel[i * 2 + 1] = vy
      pos[i * 2] = x + vx * dt
      pos[i * 2 + 1] = y + vy * dt
    }
    sim.set(pos, step * N * 2)
  }
}

function simPos(i: number, t: number): Vec {
  const f = clamp((t - BURST) * SIM_HZ, 0, STEPS)
  const a = Math.floor(f)
  const b = Math.min(STEPS, a + 1)
  const k = f - a
  const ia = (a * N + i) * 2
  const ib = (b * N + i) * 2
  return [sim[ia]! + (sim[ib]! - sim[ia]!) * k, sim[ia + 1]! + (sim[ib + 1]! - sim[ia + 1]!) * k]
}

const target = new Float32Array(N * 2)
const delay = new Float32Array(N)
const arc = new Float32Array(N)
export const textColor: string[] = []
export const layerColor: string[] = []
export let textBounds = { x0: 0, x1: 0, y0: 0, y1: 0 }

function sampleText() {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.font = TEXT_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(TEXT, CENTER[0], TEXT_Y)
  const img = ctx.getImageData(0, 0, W, H).data
  const pts: Vec[] = []
  const step = 3
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (img[(y * W + x) * 4 + 3]! > 160) pts.push([x, y])
    }
  }
  const r = mulberry32(77)
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[pts[i], pts[j]] = [pts[j]!, pts[i]!]
  }
  const chosen: Vec[] = []
  for (let i = 0; i < N; i++) {
    const p = pts[i % pts.length]!
    chosen.push(i < pts.length ? p : [p[0] + (r() - 0.5) * 2, p[1] + (r() - 0.5) * 2])
  }
  const x0 = Math.min(...chosen.map((p) => p[0]))
  const x1 = Math.max(...chosen.map((p) => p[0]))
  const y0 = Math.min(...chosen.map((p) => p[1]))
  const y1 = Math.max(...chosen.map((p) => p[1]))
  textBounds = { x0, x1, y0, y1 }

  const order = Array.from({ length: N }, (_, i) => i).sort(
    (a, b) => simPos(a, CONVERGE_FROM)[0] - simPos(b, CONVERGE_FROM)[0],
  )
  chosen.sort((a, b) => a[0] - b[0])
  order.forEach((pi, k) => {
    const p = chosen[k]!
    target[pi * 2] = p[0]
    target[pi * 2 + 1] = p[1]
    const sweep = (p[0] - x0) / (x1 - x0 || 1)
    delay[pi] = CONVERGE_SPREAD * (0.72 * sweep + 0.28 * rand[pi * 4 + 3]!)
    arc[pi] = (rand[pi * 4 + 2]! - 0.5) * 260
  })
  for (let i = 0; i < N; i++) {
    const sweep = (target[i * 2]! - x0) / (x1 - x0 || 1)
    textColor.push(mixHex(TEXT_LEFT, TEXT_RIGHT, sweep))
    layerColor.push(LAYER_COLORS[layer[i]!]!)
  }
}

/** 0 是自由飘、1 是落在字上。 */
export function formed(i: number, t: number): number {
  return easeInOutCubic(clamp((t - CONVERGE_FROM - delay[i]!) / CONVERGE_DUR))
}

function shimmer(i: number, t: number): Vec {
  const k = clamp((t - FORMED + 0.6) / 0.6)
  return [noise1(t * 2.2 + i * 7.31) * 1.6 * k, noise1(t * 2.2 + i * 3.17 + 50) * 1.6 * k]
}

/** 粒子 i 在 t 时刻的位置；t 落在爆开到散场之后约 1.5 秒内。 */
export function particleAt(i: number, t: number): Vec {
  const tx = target[i * 2]!
  const ty = target[i * 2 + 1]!
  if (t < SCATTER) {
    const p = simPos(i, t)
    const e = formed(i, t)
    if (e <= 0) return p
    const dx = tx - p[0]
    const dy = ty - p[1]
    const m = Math.hypot(dx, dy) || 1
    const bend = Math.sin(Math.PI * e) * arc[i]!
    const j = shimmer(i, t)
    return [p[0] + dx * e - (dy / m) * bend + j[0], p[1] + dy * e + (dx / m) * bend + j[1]]
  }
  const j = shimmer(i, SCATTER)
  const qx = tx + j[0]
  const qy = ty + j[1]
  const a = Math.atan2(qy - (TEXT_Y + 40), qx - CENTER[0]) + (rand[i * 4]! - 0.5) * 0.9
  const dist = 500 + 1300 * rand[i * 4 + 1]!
  const k = 1 - Math.exp(-3.2 * (t - SCATTER))
  return [qx + Math.cos(a) * dist * k, qy + Math.sin(a) * dist * k]
}

export function particleSpeed(i: number, t: number): number {
  const a = particleAt(i, t - 1 / 120)
  const b = particleAt(i, t + 1 / 120)
  return Math.hypot(b[0] - a[0], b[1] - a[1]) * 60
}

/** 粒子闪光（叮）事件：时间、粒子编号、音高、声像。 */
export const SPARKLES: Array<{ t: number; i: number; midi: number; pan: number }> = []

function buildSparkles() {
  const r = mulberry32(99)
  const scale = [81, 84, 86, 88, 91, 93, 96]
  let t = BURST + 0.35
  while (t < FORMED - 0.25) {
    const i = Math.floor(r() * N)
    const p = particleAt(i, t)
    SPARKLES.push({ t, i, midi: scale[Math.floor(r() * scale.length)]!, pan: clamp((p[0] / W) * 2 - 1, -0.9, 0.9) })
    t += 0.07 + r() * 0.16
  }
}

let ready = false

/**
 * 预计算：粒子模拟（120 Hz 积分 8 秒）、文字采样、闪光事件。放在合成的 setup 里，
 * 每个渲染进程只跑一次；帧函数只做查表和插值，任意 t 都能直接求值。
 */
export function setupParticles(): void {
  if (ready) return
  simulate()
  sampleText()
  buildSparkles()
  ready = true
}
