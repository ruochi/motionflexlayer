import { DEFAULT_FONT, createCanvas, type Canvas2D as CanvasRenderingContext2D } from 'motionflexlayer'
import { ECHO_SCALE, contour, geoState, vertices } from './geometry.js'
import {
  LAYER_COLORS,
  N as PN,
  SPARKLES,
  TEXT,
  TEXT_FONT,
  TEXT_Y,
  formed,
  layerColor,
  particleAt,
  textColor,
} from './particles.js'
import {
  BAR,
  BURST,
  CARD_TIMES,
  CENTER,
  FORMED,
  GEO_WINDUP,
  H,
  HEADLINE,
  IMPLODE_FROM,
  IMPLODE_TO,
  INTRO_BELLS,
  MORPHS,
  PEN,
  PEN_FROM,
  PEN_LEN,
  PEN_TO,
  RING_R,
  RIPPLES,
  SCATTER,
  SPACE_MORPHS,
  UNDERLINE_FROM,
  UNDERLINE_TO,
  W,
  ZOOM_FROM,
  ZOOM_TO,
  headlineCharTimes,
  kickEnv,
  penAt,
  penProgress,
  penSpeed,
  penTimeAt,
} from './timeline.js'
import {
  TAU,
  clamp,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  hash1,
  lerp,
  mixHex,
  mulberry32,
  rgba,
  simplex3,
  span,
  springT,
  unlerp,
  type Vec,
} from './compat.js'

type Ctx = CanvasRenderingContext2D

export const BG = '#07080d'
export const INK = '#f4f1ea'
export const MUTED = '#8d97a8'
export const AMBER = '#ffb547'
export const CORAL = '#ff5d73'
export const CYAN = '#4fd1ff'
export const VIOLET = '#8b7bff'

const FONT = DEFAULT_FONT

function path(ctx: Ctx, pts: Vec[], closed = false) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  if (closed) ctx.closePath()
}

function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  if (alpha <= 0.002 || r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.35, rgba(color, alpha * 0.35))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function streak(ctx: Ctx, x: number, y: number, len: number, color: string, alpha: number) {
  if (alpha <= 0.002) return
  const g = ctx.createLinearGradient(x - len, y, x + len, y)
  g.addColorStop(0, rgba(color, 0))
  g.addColorStop(0.5, rgba(color, alpha))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - len, y - 1, len * 2, 2)
}

function flare(ctx: Ctx, x: number, y: number, size: number, color: string, alpha: number) {
  if (alpha <= 0.002) return
  glowDot(ctx, x, y, size * 0.7, color, alpha * 0.8)
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x - size, y)
  ctx.lineTo(x + size, y)
  ctx.moveTo(x, y - size)
  ctx.lineTo(x, y + size)
  ctx.stroke()
  ctx.restore()
}

/** 柔光：同档透明度的分段并成一条路径，只描一次，重叠处不会叠亮。 */
function strokeGlow(ctx: Ctx, chunks: Array<{ pts: Vec[]; alpha: number; w: number }>, color: string) {
  const LEVELS = 5
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let q = 1; q <= LEVELS; q++) {
    const lo = (q - 1) / LEVELS
    const hi = q / LEVELS
    ctx.beginPath()
    let any = false
    for (const c of chunks) {
      if (c.alpha <= lo || c.alpha > hi) continue
      c.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      any = true
    }
    if (!any) continue
    ctx.shadowColor = rgba(color, 0.85 * hi)
    ctx.shadowBlur = 26
    ctx.strokeStyle = rgba(color, 0.32 * hi)
    ctx.lineWidth = 7
    ctx.stroke()
  }
  ctx.restore()
}

function shockRing(ctx: Ctx, t: number, t0: number, r0: number, r1: number, dur: number, width: number, color: string, alpha = 1) {
  const x = (t - t0) / dur
  if (x < 0 || x >= 1) return
  const r = lerp(r0, r1, easeOutCubic(x))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = rgba(color, alpha * (1 - x) ** 2)
  ctx.lineWidth = Math.max(0.5, width * (1 - x))
  ctx.beginPath()
  ctx.arc(CENTER[0], CENTER[1], r, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------- 背景

export function drawBackdrop(ctx: Ctx, t: number) {
  const g = ctx.createRadialGradient(CENTER[0], CENTER[1] - 80, 0, CENTER[0], CENTER[1], 1200)
  const warm = span(t, 0, 3) * (1 - span(t, 15.5, 16.5)) + span(t, 40, 41) * 0.8
  const cool = span(t, 16, 17) * (1 - span(t, 39.5, 40))
  g.addColorStop(0, mixHex('#141019', '#0b1424', cool * (1 - warm * 0.5)))
  g.addColorStop(1, BG)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/** 点阵：开场跟着笔尖亮起，几何段随拍子起伏，版式段做底纹。 */
export function drawGrid(ctx: Ctx, t: number) {
  const base = span(t, 0.4, 2.5) * (1 - span(t, 15.6, 16.2)) + span(t, 24.2, 25.5) * (1 - span(t, 30.6, 31.4))
  if (base <= 0.002) return
  let pen: Vec | null = null
  if (t < PEN_TO + 0.3) pen = penAt(penProgress(t) * PEN_LEN).p
  const step = 48
  const kick = kickEnv(t, 5)
  ctx.save()
  ctx.fillStyle = '#ffffff'
  for (let y = step / 2 + 12; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      let a = 0.045 * base
      if (pen) {
        const d2 = (x - pen[0]) ** 2 + (y - pen[1]) ** 2
        a += 0.32 * Math.exp(-d2 / (2 * 150 * 150)) * span(t, PEN_FROM - 0.8, PEN_FROM)
      }
      if (t > 8 && t < 16) {
        const d = Math.hypot(x - CENTER[0], y - CENTER[1])
        a += 0.07 * kick * Math.exp(-(((d - 260 - (1 - kick) * 500) / 120) ** 2))
      }
      if (a < 0.01) continue
      ctx.globalAlpha = Math.min(1, a)
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4)
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------- 01 起笔

const PASS_TIME = PEN.len.map((s) => penTimeAt(s))
const PASS_SPEED = PASS_TIME.map((tt) => penSpeed(tt))

const SPARKS = (() => {
  const r = mulberry32(5)
  const out: Array<{ tb: number; p: Vec; v: Vec; life: number; hot: boolean }> = []
  for (let k = 0; k < 260; k++) {
    const tb = lerp(PEN_FROM + 0.05, PEN_TO - 0.02, r())
    const { p, dir } = penAt(penProgress(tb) * PEN_LEN)
    const sp = 30 + r() * 120
    const a = Math.atan2(-dir[1], -dir[0]) + (r() - 0.5) * 2.4
    out.push({ tb, p, v: [Math.cos(a) * sp, Math.sin(a) * sp - 40], life: 0.45 + r() * 0.8, hot: r() < 0.35 })
  }
  return out
})()

function drawSparks(ctx: Ctx, t: number, sparks: typeof SPARKS) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const s of sparks) {
    const age = t - s.tb
    if (age < 0 || age > s.life) continue
    const k = age / s.life
    const x = s.p[0] + s.v[0] * age
    const y = s.p[1] + s.v[1] * age + 140 * age * age
    ctx.globalAlpha = (1 - k) ** 1.5 * 0.9
    ctx.fillStyle = s.hot ? '#fff6dc' : AMBER
    const r = s.hot ? 1.8 : 1.3
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.restore()
}

export function drawPenTip(ctx: Ctx, p: Vec, intensity: number, flash: number) {
  if (intensity <= 0.002) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glowDot(ctx, p[0], p[1], 70 * (1 + flash * 0.8), AMBER, 0.42 * intensity)
  glowDot(ctx, p[0], p[1], 18, '#fff3d6', 0.9 * intensity)
  streak(ctx, p[0], p[1], 150 + flash * 120, '#ffd9a0', 0.45 * intensity)
  ctx.fillStyle = rgba('#ffffff', intensity)
  ctx.beginPath()
  ctx.arc(p[0], p[1], 3.2, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export function drawInk(ctx: Ctx, t: number) {
  if (t > PEN_TO + 2.5) return
  const s = penProgress(t) * PEN_LEN
  const { pts, len, circleFrom } = PEN
  const CH = 4
  const chunks: Array<{ pts: Vec[]; alpha: number; w: number }> = []
  for (let a = 0; a < pts.length - 1; a += CH) {
    if (len[a]! > s) break
    const onCircle = len[a]! >= circleFrom - 1
    if (onCircle && t >= PEN_TO) continue
    const b = Math.min(pts.length - 1, a + CH)
    const mid = Math.min(b, a + 2)
    const age = t - PASS_TIME[mid]!
    const alpha = onCircle ? 1 : 1 - span(age, 0.9, 2.3)
    if (alpha <= 0.003) continue
    const v = PASS_SPEED[mid]!
    let w = 1.5 + 5.2 * clamp(1 - v / 1150)
    w *= clamp(len[a]! / 70 + 0.15)
    w *= 0.5 + 0.5 * clamp((s - len[a]!) / 50)
    if (!onCircle) w *= 1 - 0.5 * span(age, 0.9, 2.3)
    const seg: Vec[] = [pts[a]!]
    for (let k = a + 1; k <= b; k++) {
      if (len[k]! > s) {
        seg.push(penAt(s).p)
        break
      }
      seg.push(pts[k]!)
    }
    chunks.push({ pts: seg, alpha, w })
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  strokeGlow(ctx, chunks, AMBER)
  for (const c of chunks) {
    ctx.strokeStyle = rgba(INK, c.alpha)
    ctx.lineWidth = c.w
    path(ctx, c.pts)
    ctx.stroke()
  }
  ctx.restore()

  drawSparks(ctx, t, SPARKS)

  const tip = penAt(s).p
  const appear = span(t, 0.5, 1.4)
  const leave = 1 - span(t, PEN_TO, PEN_TO + 0.35)
  const breathe = t < PEN_FROM ? 0.75 + 0.25 * Math.sin(t * 7) : 1
  let flash = 0
  for (const b of INTRO_BELLS) if (t >= b.t) flash = Math.max(flash, Math.exp(-(t - b.t) * 5))
  drawPenTip(ctx, tip, appear * leave * breathe, flash)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const b of INTRO_BELLS) {
    const x = (t - b.t) / 0.9
    if (x < 0 || x > 1) continue
    const p = penAt(penProgress(b.t) * PEN_LEN).p
    ctx.strokeStyle = rgba('#ffd9a0', 0.55 * (1 - x) ** 2)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p[0], p[1], 8 + 80 * easeOutCubic(x), 0, TAU)
    ctx.stroke()
  }
  const down = (t - 1.0) / 1.0
  if (down > 0 && down < 1) {
    const p = pts[0]!
    ctx.strokeStyle = rgba(AMBER, 0.5 * (1 - down) ** 2)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(p[0], p[1], 6 + 120 * easeOutCubic(down), 0, TAU)
    ctx.stroke()
  }
  ctx.restore()

  shockRing(ctx, t, PEN_TO, RING_R, 640, 1.1, 14, AMBER, 0.9)
  shockRing(ctx, t, PEN_TO + 0.05, RING_R, 520, 1.0, 4, INK, 0.7)
}

// ---------------------------------------------------------------- 02 几何

const MORPH_T = MORPHS.map((m) => m.t)

export function drawGeometry(ctx: Ctx, t: number) {
  if (t < PEN_TO || t >= BURST) return
  const windup = span(t, GEO_WINDUP, BURST, easeInCubic)
  const R1 = 352
  const appear = span(t, 8.1, 9.3, easeOutCubic)
  const fade = 1 - span(t, 15.4, 15.95)

  ctx.save()
  ctx.globalAlpha = 0.16 * appear * fade
  ctx.strokeStyle = INK
  ctx.lineWidth = 1
  ctx.setLineDash([2, 10])
  ctx.beginPath()
  ctx.moveTo(CENTER[0] - 860, CENTER[1])
  ctx.lineTo(CENTER[0] + 860, CENTER[1])
  ctx.moveTo(CENTER[0], CENTER[1] - 470)
  ctx.lineTo(CENTER[0], CENTER[1] + 470)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  let rulerRot = (t - 8) * 0.1
  for (let m = 1; m < MORPH_T.length; m++) rulerRot += springT(t - MORPH_T[m]!, 9, 110) * (Math.PI / 12)
  rulerRot += windup * 1.4
  const hand = -Math.PI / 2 + ((t - 8) / BAR) * TAU
  const TICKS = 180
  ctx.save()
  ctx.lineCap = 'round'
  for (let k = 0; k < TICKS; k++) {
    const a = (k / TICKS) * TAU
    if (a > appear * TAU) break
    const ang = a + rulerRot - Math.PI / 2
    let lag = (hand - ang) % TAU
    if (lag < 0) lag += TAU
    const lit = Math.exp(-lag * 2.2)
    const major = k % 15 === 0
    const len = major ? 20 : 8
    ctx.globalAlpha = (0.2 + 0.7 * lit) * fade
    ctx.strokeStyle = lit > 0.3 ? AMBER : INK
    ctx.lineWidth = major ? 2 : 1.2
    ctx.beginPath()
    ctx.moveTo(CENTER[0] + Math.cos(ang) * R1, CENTER[1] + Math.sin(ang) * R1)
    ctx.lineTo(CENTER[0] + Math.cos(ang) * (R1 + len), CENTER[1] + Math.sin(ang) * (R1 + len))
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const tr of RIPPLES) {
    const x = (t - tr) / 1.4
    if (x < 0 || x >= 1) continue
    const shape = contour(tr, 0, 180)
    const k = 1 + 1.5 * easeOutCubic(x)
    ctx.strokeStyle = rgba(CYAN, 0.5 * (1 - x) ** 2 * fade)
    ctx.lineWidth = 1.6
    path(ctx, shape.map(([px, py]) => [CENTER[0] + (px - CENTER[0]) * k, CENTER[1] + (py - CENTER[1]) * k] as Vec), true)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.lineJoin = 'round'
  for (let j = ECHO_SCALE.length - 1; j >= 0; j--) {
    const shape = contour(t, j, 240)
    const color = j === 0 ? INK : LAYER_COLORS[j]!
    const glow = j === 0 ? AMBER : LAYER_COLORS[j]!
    if (j === 0) {
      ctx.fillStyle = rgba(AMBER, 0.035 + 0.05 * windup)
      path(ctx, shape, true)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = rgba(glow, 0.12 + 0.18 * windup)
    ctx.lineWidth = 16
    path(ctx, shape, true)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = color
    ctx.lineWidth = [3.2, 2.4, 2, 1.8][j]!
    path(ctx, shape, true)
    ctx.stroke()
  }
  ctx.restore()

  const outer = contour(t, 0, 240)
  const head = Math.floor(((t - 8) * 0.55 % 1) * outer.length)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let k = 0; k < 28; k++) {
    const a = outer[(head - k + outer.length) % outer.length]!
    const b = outer[(head - k - 1 + outer.length) % outer.length]!
    ctx.strokeStyle = rgba(AMBER, (1 - k / 28) * 0.9 * appear)
    ctx.lineWidth = 4 * (1 - k / 28) + 0.5
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  glowDot(ctx, outer[head]![0], outer[head]![1], 26, AMBER, 0.8 * appear)
  ctx.restore()

  const vs = vertices(t, 0)
  const st = geoState(t, 0)
  const vIn = clamp(st.p * 1.2)
  ctx.save()
  for (const [vx, vy] of vs) {
    const dx = vx - CENTER[0]
    const dy = vy - CENTER[1]
    const m = Math.hypot(dx, dy) || 1
    ctx.globalAlpha = 0.35 * vIn * fade
    ctx.strokeStyle = INK
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(vx + (dx / m) * 14, vy + (dy / m) * 14)
    ctx.lineTo(CENTER[0] + (dx / m) * (R1 - 8), CENTER[1] + (dy / m) * (R1 - 8))
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'lighter'
    glowDot(ctx, vx, vy, 30, AMBER, 0.6 * vIn)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(vx, vy, 5 * vIn, 0, TAU)
    ctx.fill()
  }
  ctx.restore()

  for (let m = 1; m < MORPH_T.length; m++) {
    shockRing(ctx, t, MORPH_T[m]!, 230, 560, 0.9, 6, LAYER_COLORS[m]!, 0.45)
  }
  shockRing(ctx, t, 8, RING_R, 900, 1.6, 3, CYAN, 0.35)
  if (windup > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glowDot(ctx, CENTER[0], CENTER[1], 420 * windup, AMBER, 0.35 * windup)
    ctx.restore()
  }
}

// ---------------------------------------------------------------- 03 粒子

const MIX_STEPS = 6
/** 依赖 setup 里采样出的文字颜色，第一次绘制时才算。 */
const PCOLORS: string[][] = []
function particleColors() {
  if (PCOLORS.length) return
  for (let i = 0; i < PN; i++) {
    const row: string[] = []
    for (let q = 0; q <= MIX_STEPS; q++) row.push(mixHex(layerColor[i]!, textColor[i]!, q / MIX_STEPS))
    PCOLORS.push(row)
  }
}

export function drawFlow(ctx: Ctx, t: number) {
  if (t < BURST || t > SCATTER + 1.6) return
  particleColors()
  const out = t < SCATTER ? 1 : (1 - clamp((t - SCATTER) / 1.5)) ** 1.6
  const formedGlow = span(t, FORMED - 0.5, FORMED + 0.3) * (1 - span(t, SCATTER, SCATTER + 0.25))

  if (formedGlow > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.font = TEXT_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = rgba(AMBER, 0.9)
    ctx.shadowBlur = 70
    ctx.fillStyle = rgba(CORAL, 0.07 * formedGlow)
    ctx.fillText(TEXT, CENTER[0], TEXT_Y)
    ctx.restore()
  }

  shockRing(ctx, t, BURST, 150, 1100, 1.3, 26, AMBER, 0.85)
  shockRing(ctx, t, BURST + 0.04, 120, 900, 1.2, 6, CYAN, 0.7)

  const DT = 1 / 55
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineWidth = 1.5
  for (let i = 0; i < PN; i++) {
    const p0 = particleAt(i, t)
    const p1 = particleAt(i, t - DT)
    const p2 = particleAt(i, t - DT * 2)
    const p3 = particleAt(i, t - DT * 3)
    const e = formed(i, t)
    const col = PCOLORS[i]![Math.round(e * MIX_STEPS)]!
    const a = out * (0.62 + 0.38 * hash1(i)) * lerp(1, 0.85, e)
    ctx.strokeStyle = col
    ctx.globalAlpha = a * 0.5
    ctx.beginPath()
    ctx.moveTo(p0[0], p0[1])
    ctx.lineTo(p1[0], p1[1])
    ctx.lineTo(p2[0], p2[1])
    ctx.lineTo(p3[0], p3[1])
    ctx.stroke()
    ctx.globalAlpha = a
    ctx.fillStyle = col
    const r = lerp(1.5, 1.1, e)
    ctx.fillRect(p0[0] - r, p0[1] - r, r * 2, r * 2)
  }
  ctx.globalAlpha = 1
  for (const sp of SPARKLES) {
    const x = (t - sp.t) / 0.6
    if (x < 0 || x >= 1) continue
    const p = particleAt(sp.i, t)
    flare(ctx, p[0], p[1], 26 * (1 - x) + 4, '#fff1cf', (1 - x) ** 2)
  }
  ctx.restore()

  const sweep = (t - FORMED) / 0.75
  if (sweep > 0 && sweep < 1) {
    const x = lerp(CENTER[0] - 600, CENTER[0] + 600, easeInOutCubic(sweep))
    const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,248,230,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.font = TEXT_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = g
    ctx.fillText(TEXT, CENTER[0], TEXT_Y)
    ctx.restore()
  }
  shockRing(ctx, t, SCATTER, 80, 1300, 1.2, 18, CORAL, 0.6)
}

// ---------------------------------------------------------------- 04 版式

const CHAR_TIMES = headlineCharTimes()
const HEAD_FONT = `800 84px ${FONT}`
const measure = createCanvas(4, 4).getContext('2d')

export function drawHeadline(ctx: Ctx, el: { w: number; h: number }, t: number) {
  if (t < CHAR_TIMES[0]! - 0.1) return
  ctx.save()
  ctx.font = HEAD_FONT
  measure.font = HEAD_FONT
  ctx.textBaseline = 'alphabetic'
  const chars = [...HEADLINE]
  const widths = chars.map((c) => measure.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0)
  let x = (el.w - total) / 2
  const y = el.h * 0.72
  const tagFrom = HEADLINE.indexOf('<')
  const tagTo = HEADLINE.indexOf('>')
  let caretX = x
  chars.forEach((c, k) => {
    const tc = CHAR_TIMES[k]!
    const a = clamp((t - tc) / 0.1)
    if (a > 0) {
      const sp = springT(t - tc, 11, 190)
      const isTag = k >= tagFrom && k <= tagTo
      ctx.globalAlpha = a
      ctx.fillStyle = isTag ? AMBER : INK
      if (isTag) {
        ctx.shadowColor = rgba(AMBER, 0.6)
        ctx.shadowBlur = 24
      } else ctx.shadowBlur = 0
      ctx.fillText(c, x, y + (1 - sp) * 40)
      caretX = x + widths[k]!
    }
    x += widths[k]!
  })
  ctx.shadowBlur = 0
  const done = CHAR_TIMES[CHAR_TIMES.length - 1]!
  const blink = t < done + 0.1 ? 1 : Math.sin((t - done) * TAU * 1.6) > 0 ? 1 : 0.15
  ctx.globalAlpha = blink * (1 - span(t, 29.6, 30.2))
  ctx.fillStyle = AMBER
  ctx.fillRect(caretX + 8, y - 70, 5, 84)
  ctx.restore()
}

function vizFrame(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 24; x < w; x += 24) {
    ctx.moveTo(x, 8)
    ctx.lineTo(x, h - 8)
  }
  for (let y = 24; y < h; y += 24) {
    ctx.moveTo(8, y)
    ctx.lineTo(w - 8, y)
  }
  ctx.stroke()
}

function vizWave(ctx: Ctx, w: number, h: number, t: number, reveal: number) {
  const kick = kickEnv(t, 6)
  const waves = [
    { color: CYAN, amp: 46, f: 0.034, sp: 3.1, ph: 0 },
    { color: VIOLET, amp: 30, f: 0.052, sp: -2.2, ph: 1.7 },
    { color: INK, amp: 22, f: 0.021, sp: 1.6, ph: 3.1 },
  ]
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w * reveal, h)
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  for (const wv of waves) {
    const pts: Vec[] = []
    for (let x = 10; x <= w - 10; x += 3) {
      const win = Math.sin((Math.PI * (x - 10)) / (w - 20)) ** 1.5
      const y = h / 2 + Math.sin(x * wv.f + t * wv.sp + wv.ph) * wv.amp * (0.75 + 0.6 * kick) * win
      pts.push([x, y])
    }
    ctx.strokeStyle = rgba(wv.color, 0.2)
    ctx.lineWidth = 8
    path(ctx, pts)
    ctx.stroke()
    ctx.strokeStyle = wv.color
    ctx.lineWidth = 2
    path(ctx, pts)
    ctx.stroke()
  }
  ctx.restore()
}

function vizBars(ctx: Ctx, w: number, h: number, t: number, reveal: number) {
  const COUNT = 10
  const gap = 8
  const bw = (w - 32 - gap * (COUNT - 1)) / COUNT
  const beat = Math.floor(t * 2)
  ctx.save()
  ctx.font = `600 14px ${FONT}`
  ctx.textAlign = 'center'
  for (let k = 0; k < COUNT; k++) {
    const prev = 0.2 + 0.75 * hash1(k * 13 + (beat - 1) * 7.7)
    const next = 0.2 + 0.75 * hash1(k * 13 + beat * 7.7)
    const sp = springT(t - beat / 2 - k * 0.025, 10, 160)
    const v = lerp(prev, next, sp) * span(reveal, k * 0.05, k * 0.05 + 0.5, easeOutCubic)
    const bh = v * (h - 64)
    const x = 16 + k * (bw + gap)
    const y = h - 22 - bh
    const g = ctx.createLinearGradient(0, y, 0, h - 22)
    g.addColorStop(0, AMBER)
    g.addColorStop(1, rgba(CORAL, 0.35))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(x, y, bw, bh, 4)
    ctx.fill()
    ctx.fillStyle = rgba(INK, 0.75 * reveal)
    ctx.fillText(String(Math.round(v * 99)), x + bw / 2, y - 8)
  }
  ctx.fillStyle = rgba(INK, 0.25)
  ctx.fillRect(12, h - 20, w - 24, 1.5)
  ctx.restore()
}

export function orbitZoom(t: number) {
  return span(t, ZOOM_FROM, ZOOM_TO, easeInCubic)
}

function vizOrbits(ctx: Ctx, w: number, h: number, t: number, reveal: number) {
  const cx = w / 2
  const cy = h / 2
  const zoom = orbitZoom(t)
  const kick = kickEnv(t, 6)
  const sc = easeOutCubic(reveal)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const orbits = [
    { rx: 128, ry: 50, tilt: -0.28, sp: 0.9, color: CYAN, r: 6 },
    { rx: 92, ry: 36, tilt: -0.28, sp: -1.4, color: VIOLET, r: 5 },
    { rx: 56, ry: 22, tilt: -0.28, sp: 2.3, color: CORAL, r: 4 },
  ]
  for (const o of orbits) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(o.tilt)
    ctx.strokeStyle = rgba(INK, 0.18 * sc)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(0, 0, o.rx * sc, o.ry * sc, 0, 0, TAU)
    ctx.stroke()
    const a0 = t * o.sp
    for (let k = 0; k < 22; k++) {
      const a = a0 - Math.sign(o.sp) * k * 0.06
      ctx.fillStyle = rgba(o.color, (1 - k / 22) * 0.8 * sc)
      const r = o.r * (1 - k / 22) + 0.5
      ctx.beginPath()
      ctx.arc(Math.cos(a) * o.rx * sc, Math.sin(a) * o.ry * sc, r, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
  const sunR = (13 + 4 * kick) * sc
  glowDot(ctx, cx, cy, sunR * (4 + zoom * 10), AMBER, 0.55 + zoom * 0.45)
  ctx.fillStyle = mixHex('#ffd48a', '#ffffff', zoom)
  ctx.beginPath()
  ctx.arc(cx, cy, sunR, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function vizRidges(ctx: Ctx, w: number, h: number, t: number, reveal: number) {
  const LINES = 13
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 16)
  ctx.clip()
  for (let j = 0; j < LINES; j++) {
    const k = span(reveal, j / LINES * 0.6, j / LINES * 0.6 + 0.4, easeOutCubic)
    if (k <= 0) continue
    const base = 46 + j * ((h - 70) / (LINES - 1))
    const pts: Vec[] = []
    for (let x = 0; x <= w; x += 4) {
      const centerWeight = Math.exp(-(((x - w / 2) / (w * 0.22)) ** 2))
      const n = simplex3(x * 0.018, j * 0.45, t * 0.6) * 0.5 + 0.5
      pts.push([x, base - n * n * 70 * centerWeight * k - 2 * k])
    }
    ctx.fillStyle = '#0a0b11'
    ctx.beginPath()
    ctx.moveTo(0, h)
    pts.forEach(([x, y]) => ctx.lineTo(x, y))
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = mixHex(INK, CYAN, j / LINES)
    ctx.globalAlpha = 0.85 * k
    ctx.lineWidth = 1.6
    path(ctx, pts)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

export const VIZ = [vizWave, vizBars, vizOrbits, vizRidges]

export function drawViz(index: number) {
  return (ctx: Ctx, el: { w: number; h: number; t: number }) => {
    const reveal = span(el.t, CARD_TIMES[index]! + 0.12, CARD_TIMES[index]! + 1.1)
    vizFrame(ctx, el.w, el.h)
    VIZ[index]!(ctx, el.w, el.h, el.t, reveal)
  }
}

// ---------------------------------------------------------------- 05 空间

const SN = 1800
type Cloud = Float32Array

function buildClouds(): Cloud[] {
  const sphere = new Float32Array(SN * 3)
  const torus = new Float32Array(SN * 3)
  const knot = new Float32Array(SN * 3)
  const shell = new Float32Array(SN * 3)
  const r = mulberry32(31)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < SN; i++) {
    const y = 1 - (2 * (i + 0.5)) / SN
    const rr = Math.sqrt(1 - y * y)
    const ph = i * golden
    sphere.set([rr * Math.cos(ph), y, rr * Math.sin(ph)], i * 3)

    const ring = Math.floor(i / 50)
    const u = (ring / 36) * TAU
    const v = ((i % 50) / 50) * TAU + ring * 0.09
    const R = 1.0
    const tr = 0.4
    torus.set([(R + tr * Math.cos(v)) * Math.cos(u), tr * Math.sin(v), (R + tr * Math.cos(v)) * Math.sin(u)], i * 3)

    const s = (i / SN) * TAU
    const p = 2
    const q = 3
    const kx = (2 + Math.cos(q * s)) * Math.cos(p * s) * 0.42
    const ky = (2 + Math.cos(q * s)) * Math.sin(p * s) * 0.42
    const kz = Math.sin(q * s) * 0.42
    const th = r() * TAU
    const ph2 = Math.acos(2 * r() - 1)
    const off = 0.09 * Math.cbrt(r())
    knot.set([kx + off * Math.sin(ph2) * Math.cos(th), kz + off * Math.cos(ph2), ky + off * Math.sin(ph2) * Math.sin(th)], i * 3)

    const nn = 1.3 + 0.18 * simplex3(sphere[i * 3]! * 1.6, sphere[i * 3 + 1]! * 1.6, sphere[i * 3 + 2]! * 1.6)
    shell.set([sphere[i * 3]! * nn, sphere[i * 3 + 1]! * nn, sphere[i * 3 + 2]! * nn], i * 3)
  }
  return [sphere, torus, knot, shell]
}

const CLOUDS = buildClouds()
const SPACE_COLORS = [CYAN, VIOLET, CORAL, AMBER, CYAN]
const POINT_COLOR = Array.from({ length: SN }, (_, i) => {
  const u = (i / SN) * (SPACE_COLORS.length - 1)
  const k = Math.floor(u)
  return mixHex(SPACE_COLORS[k]!, SPACE_COLORS[Math.min(SPACE_COLORS.length - 1, k + 1)]!, u - k)
})

const STARS = (() => {
  const r = mulberry32(8)
  return Array.from({ length: 520 }, () => ({ x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 1.4, z: r(), b: 0.3 + 0.7 * r() }))
})()

function spaceCamera(t: number) {
  const implode = span(t, IMPLODE_FROM, IMPLODE_TO, easeInCubic)
  let yaw = 0.42 * (t - 32)
  for (let m = 1; m < SPACE_MORPHS.length; m++) yaw += springT(t - SPACE_MORPHS[m]!, 9, 80) * 0.9
  yaw += implode * implode * 9
  const pitch = 0.36 + 0.14 * Math.sin(0.8 * t)
  return { yaw, pitch, implode }
}

function project(x: number, y: number, z: number, yaw: number, pitch: number) {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const x1 = x * cy - z * sy
  const z1 = x * sy + z * cy
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const y2 = y * cp - z1 * sp
  const z2 = y * sp + z1 * cp
  const D = 4.2
  const F = 1250
  const k = F / (D - z2)
  return { x: CENTER[0] + x1 * k, y: CENTER[1] + y2 * k, depth: clamp((z2 + 1.6) / 3.2), k }
}

export function drawSpace(ctx: Ctx, t: number) {
  if (t < ZOOM_TO - 0.05 || t > 40.05) return
  const { yaw, pitch, implode } = spaceCamera(t)
  const kick = kickEnv(t, 6)
  const born = t - 32

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const warp = implode
  const drift = (t - 32) * 0.05
  for (const s of STARS) {
    let z = (s.z - drift + 10) % 1
    if (warp > 0) z = (z + warp * warp * 1.6) % 1
    const zz = 0.08 + z * 0.92
    const sx = CENTER[0] + (s.x / zz) * 520
    const sy = CENTER[1] + (s.y / zz) * 520
    if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue
    const a = s.b * (1 - z) * 0.8 * span(born, 0, 0.8)
    const len = 2 + warp * 90 * (1 - z)
    const dx = sx - CENTER[0]
    const dy = sy - CENTER[1]
    const m = Math.hypot(dx, dy) || 1
    ctx.strokeStyle = rgba('#cfe6ff', a)
    ctx.lineWidth = 1.2 + (1 - z) * 1.2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx - (dx / m) * len, sy - (dy / m) * len)
    ctx.stroke()
  }

  const rings = [
    { r: 1.55, tilt: 0.35, sp: 0.6, color: CYAN },
    { r: 1.8, tilt: -0.55, sp: -0.45, color: VIOLET },
    { r: 2.0, tilt: 0.95, sp: 0.3, color: CORAL },
  ]
  const ringIn = span(born, 0.4, 1.6, easeOutCubic) * (1 - implode)
  for (const rg of rings) {
    const pts: Vec[] = []
    const ct = Math.cos(rg.tilt)
    const st = Math.sin(rg.tilt)
    const at = (u: number) => {
      const x = Math.cos(u) * rg.r * ringIn
      const z = Math.sin(u) * rg.r * ringIn
      return project(x, -z * st, z * ct, yaw * 0.6, pitch)
    }
    for (let k = 0; k <= 96; k++) {
      const p = at((k / 96) * TAU)
      pts.push([p.x, p.y])
    }
    ctx.strokeStyle = rgba(rg.color, 0.22 * ringIn)
    ctx.lineWidth = 1.2
    path(ctx, pts)
    ctx.stroke()
    for (let k = 0; k < 24; k++) {
      const p = at(t * rg.sp * 2 - Math.sign(rg.sp) * k * 0.035)
      ctx.fillStyle = rgba(rg.color, (1 - k / 24) * 0.9 * ringIn)
      const rr = (3.2 * (1 - k / 24) + 0.5) * (0.6 + p.depth * 0.8)
      ctx.beginPath()
      ctx.arc(p.x, p.y, rr, 0, TAU)
      ctx.fill()
    }
  }

  const stagger = 0.35
  const linkStrength = Math.max(
    span(t, 34.3, 35, smoothstep) * (1 - span(t, 35.8, 36.3, smoothstep)),
    span(t, 36.3, 37, smoothstep) * (1 - span(t, 37.8, 38.3, smoothstep)),
  )
  const pts = new Float32Array(SN * 3)
  for (let i = 0; i < SN; i++) {
    const lag = (i / SN) * stagger
    let x = CLOUDS[0]![i * 3]!
    let y = CLOUDS[0]![i * 3 + 1]!
    let z = CLOUDS[0]![i * 3 + 2]!
    for (let m = 1; m < CLOUDS.length; m++) {
      const e = easeInOutCubic(clamp((t - SPACE_MORPHS[m]! - lag) / 0.95))
      if (e <= 0) break
      const c = CLOUDS[m]!
      x = lerp(x, c[i * 3]!, e)
      y = lerp(y, c[i * 3 + 1]!, e)
      z = lerp(z, c[i * 3 + 2]!, e)
    }
    const g = springT(born - (i / SN) * 0.2, 8, 70) * (1 + 0.07 * kick * (0.5 + hash1(i))) * (1 - implode)
    pts[i * 3] = x * g
    pts[i * 3 + 1] = y * g
    pts[i * 3 + 2] = z * g
  }
  if (linkStrength > 0.01) {
    ctx.strokeStyle = rgba(INK, 0.14 * linkStrength)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < SN - 1; i++) {
      const a = project(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!, yaw, pitch)
      const b = project(pts[i * 3 + 3]!, pts[i * 3 + 4]!, pts[i * 3 + 5]!, yaw, pitch)
      if (Math.hypot(a.x - b.x, a.y - b.y) > 60) continue
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()
  }
  for (let i = 0; i < SN; i++) {
    const p = project(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!, yaw, pitch)
    const size = (1.1 + 2.6 * p.depth) * (1 + 0.6 * kick)
    ctx.globalAlpha = (0.22 + 0.72 * p.depth) * (0.6 + 0.4 * (1 - implode))
    ctx.fillStyle = POINT_COLOR[i]!
    if (size < 2.4) ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size)
    else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, size * 0.6, 0, TAU)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  const core = 0.25 + 0.75 * implode + 0.25 * kick
  glowDot(ctx, CENTER[0], CENTER[1], 160 + 200 * implode, AMBER, 0.25 * core)
  if (t > IMPLODE_TO - 0.15) {
    const beat = 0.5 + 0.5 * Math.sin((t - IMPLODE_TO) * TAU * 8)
    glowDot(ctx, CENTER[0], CENTER[1], 60 + beat * 30, '#ffffff', 0.9)
    streak(ctx, CENTER[0], CENTER[1], 260 + beat * 80, '#ffe2b0', 0.7)
  }
  ctx.restore()

  for (let m = 1; m < SPACE_MORPHS.length; m++) shockRing(ctx, t, SPACE_MORPHS[m]!, 260, 760, 1.0, 6, SPACE_COLORS[m]!, 0.45)
  const white = Math.exp(-Math.max(0, t - 32) * 7.5) * (t >= 32 ? 1 : span(t, 31.85, 32))
  if (white > 0.003) {
    ctx.fillStyle = rgba('#fff8ec', white)
    ctx.fillRect(0, 0, W, H)
  }
}

function smoothstep(v: number) {
  return v * v * (3 - 2 * v)
}

// ---------------------------------------------------------------- 06 落款

const DEBRIS = (() => {
  const r = mulberry32(404)
  return Array.from({ length: 320 }, () => {
    const a = r() * TAU
    return { a, sp: 300 + 1500 * r() ** 2, life: 0.8 + 1.6 * r(), color: r() < 0.5 ? AMBER : r() < 0.5 ? CORAL : INK }
  })
})()

const UL: Vec[] = (() => {
  const P0: Vec = [600, 612]
  const P1: Vec = [820, 660]
  const P2: Vec = [1120, 572]
  const P3: Vec = [1330, 600]
  const out: Vec[] = []
  for (let k = 0; k <= 240; k++) {
    const u = k / 240
    const a = (1 - u) ** 3
    const b = 3 * (1 - u) ** 2 * u
    const c = 3 * (1 - u) * u * u
    const d = u ** 3
    out.push([a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1]])
  }
  return out
})()

const UL_SPARKS = (() => {
  const r = mulberry32(12)
  return Array.from({ length: 70 }, () => {
    const tb = lerp(UNDERLINE_FROM, UNDERLINE_TO, r())
    const k = Math.floor(underlineProgress(tb) * (UL.length - 1))
    const sp = 30 + r() * 110
    const a = Math.PI + (r() - 0.5) * 2.6
    return { tb, p: UL[k]!, v: [Math.cos(a) * sp, Math.sin(a) * sp - 50] as Vec, life: 0.4 + r() * 0.7, hot: r() < 0.4 }
  })
})()

export function underlineProgress(t: number) {
  return easeInOutCubic(unlerp(t, UNDERLINE_FROM, UNDERLINE_TO))
}

export function drawSign(ctx: Ctx, t: number) {
  if (t < 40) return
  shockRing(ctx, t, 40, 0, 1500, 1.5, 48, CORAL, 0.8)
  shockRing(ctx, t, 40.03, 0, 1450, 1.45, 30, AMBER, 0.9)
  shockRing(ctx, t, 40.06, 0, 1400, 1.4, 12, CYAN, 0.8)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const d of DEBRIS) {
    const age = t - 40
    if (age > d.life) continue
    const dist = (d.sp / 2.4) * (1 - Math.exp(-2.4 * age))
    const prev = (d.sp / 2.4) * (1 - Math.exp(-2.4 * Math.max(0, age - 0.04)))
    const k = age / d.life
    ctx.strokeStyle = rgba(d.color, (1 - k) ** 1.5)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(CENTER[0] + Math.cos(d.a) * dist, CENTER[1] + Math.sin(d.a) * dist)
    ctx.lineTo(CENTER[0] + Math.cos(d.a) * prev, CENTER[1] + Math.sin(d.a) * prev)
    ctx.stroke()
  }
  ctx.restore()

  const u = underlineProgress(t)
  if (u > 0) {
    const upto = Math.floor(u * (UL.length - 1))
    const fade = 1 - span(t, 46.6, 47.9)
    const chunks: Array<{ pts: Vec[]; alpha: number; w: number }> = []
    for (let a = 0; a < upto; a += 3) {
      const b = Math.min(upto, a + 3)
      const x = a / (UL.length - 1)
      chunks.push({ pts: UL.slice(a, b + 1), alpha: fade, w: (1.2 + 5.5 * Math.sin(Math.PI * x) ** 0.8) * fade })
    }
    ctx.save()
    ctx.lineCap = 'round'
    strokeGlow(ctx, chunks, AMBER)
    for (const c of chunks) {
      ctx.strokeStyle = rgba('#ffd27a', c.alpha)
      ctx.lineWidth = c.w
      path(ctx, c.pts)
      ctx.stroke()
    }
    ctx.restore()
    drawSparks(ctx, t, UL_SPARKS)
    const tipIn = span(t, UNDERLINE_FROM - 0.35, UNDERLINE_FROM) * (1 - span(t, UNDERLINE_TO, UNDERLINE_TO + 0.4))
    drawPenTip(ctx, UL[upto]!, tipIn, 0)
  } else if (t > UNDERLINE_FROM - 0.35) {
    drawPenTip(ctx, UL[0]!, span(t, UNDERLINE_FROM - 0.35, UNDERLINE_FROM), 0)
  }

  const flash = Math.exp(-(t - 40) * 4.2)
  if (flash > 0.003) {
    ctx.fillStyle = rgba('#fff8ec', flash)
    ctx.fillRect(0, 0, W, H)
  }
}

export function drawGlint(ctx: Ctx, t: number, at: Vec) {
  const x = (t - 46.0) / 0.9
  if (x < 0 || x > 1) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const a = Math.sin(Math.PI * x)
  ctx.translate(at[0], at[1])
  ctx.rotate(x * 0.8)
  flare(ctx, 0, 0, 46 * a + 6, '#fff1cf', a)
  ctx.restore()
}

// ---------------------------------------------------------------- 全局

const GRAIN = (() => {
  const c = createCanvas(256, 256)
  const g = c.getContext('2d')
  const img = g.createImageData(256, 256)
  const r = mulberry32(3)
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.floor(r() * 255)
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
})()

export function drawPost(ctx: Ctx, t: number) {
  const v = ctx.createRadialGradient(CENTER[0], CENTER[1], 300, CENTER[0], CENTER[1], 1150)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)

  const f = Math.floor(t * 60)
  const ox = Math.floor(hash1(f) * 256)
  const oy = Math.floor(hash1(f + 0.5) * 256)
  ctx.save()
  ctx.globalAlpha = 0.045
  ctx.globalCompositeOperation = 'overlay'
  for (let y = -oy; y < H; y += 256) {
    for (let x = -ox; x < W; x += 256) (ctx as unknown as { drawImage(img: unknown, x: number, y: number): void }).drawImage(GRAIN, x, y)
  }
  ctx.restore()

  const black = span(t, 46.6, 47.95)
  const intro = 1 - span(t, 0, 0.5)
  const k = Math.max(black, intro)
  if (k > 0.002) {
    ctx.fillStyle = rgba('#000000', k)
    ctx.fillRect(0, 0, W, H)
  }
}

export function drawHudChrome(ctx: Ctx, el: { w: number; h: number }, t: number, progress: number) {
  const inset = 56
  const L = 34
  ctx.save()
  ctx.strokeStyle = rgba(INK, 0.4)
  ctx.lineWidth = 2
  const corners: Array<[number, number, number, number]> = [
    [inset, inset, 1, 1],
    [el.w - inset, inset, -1, 1],
    [inset, el.h - inset, 1, -1],
    [el.w - inset, el.h - inset, -1, -1],
  ]
  const open = span(t, 0.6, 1.6, easeOutCubic)
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * L * open)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * L * open, y)
    ctx.stroke()
  }
  const x0 = 440
  const x1 = el.w - 440
  const y = el.h - 64
  ctx.fillStyle = rgba(INK, 0.12)
  ctx.fillRect(x0, y - 1, (x1 - x0) * open, 2)
  ctx.fillStyle = AMBER
  ctx.fillRect(x0, y - 1, (x1 - x0) * progress, 2)
  ctx.globalCompositeOperation = 'lighter'
  glowDot(ctx, x0 + (x1 - x0) * progress, y, 14, AMBER, 0.9 * open)
  ctx.restore()
}