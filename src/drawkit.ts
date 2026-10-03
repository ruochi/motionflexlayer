import { createCanvas, DEFAULT_FONT, type Canvas2D } from './canvas.js'
import { rgba } from './color.js'

/** canvas 字体串。weight 支持可变字重 100..900。 */
export const font = (size: number, weight = 400, family = DEFAULT_FONT) => `${weight} ${size}px ${family}`

export type Glyph = {
  ch: string
  index: number
  /** 字形左边缘，相对整行起点。 */
  x: number
  width: number
  /** 字形中心，相对整行起点。 */
  cx: number
}

/**
 * 量出每个字形的位置。用前缀宽度推算，保留字距调整（kerning）。
 * letterSpacing 加在每个字后面，和 CSS 一致。
 */
export function measureGlyphs(ctx: Canvas2D, str: string, letterSpacing = 0): { glyphs: Glyph[]; width: number } {
  const chars = [...str]
  const glyphs: Glyph[] = []
  let prefix = ''
  let prevW = 0
  for (let i = 0; i < chars.length; i++) {
    prefix += chars[i]
    const w = ctx.measureText(prefix).width
    const x = prevW + i * letterSpacing
    const width = w - prevW
    glyphs.push({ ch: chars[i]!, index: i, x, width, cx: x + width / 2 })
    prevW = w
  }
  return { glyphs, width: prevW + Math.max(0, chars.length - 1) * letterSpacing }
}

export type GlyphStyle = {
  dx?: number
  dy?: number
  /** 绕字形中心旋转，度。 */
  rotate?: number
  /** 绕字形基线中心缩放。 */
  scale?: number
  alpha?: number
  color?: string
  /** 光晕模糊半径。 */
  glow?: number
  glowColor?: string
}

export type DrawGlyphsOptions = {
  x: number
  /** 基线 y。 */
  y: number
  font: string
  color: string
  align?: 'left' | 'center' | 'right'
  letterSpacing?: number
  /** 每个字形的样式。返回 null 跳过这个字。 */
  each?: (g: Glyph, n: number) => GlyphStyle | null
}

/**
 * 逐字绘制，每个字可以单独位移、旋转、缩放、换色。
 * flexlayer 的 HTML 文字只能整段做变换，逐字动画在 draw 里用它。
 */
export function drawGlyphs(ctx: Canvas2D, str: string, opts: DrawGlyphsOptions): Glyph[] {
  ctx.save()
  ctx.font = opts.font
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const { glyphs, width } = measureGlyphs(ctx, str, opts.letterSpacing ?? 0)
  const align = opts.align ?? 'left'
  const x0 = align === 'left' ? opts.x : align === 'center' ? opts.x - width / 2 : opts.x - width
  for (const g of glyphs) {
    if (g.ch === ' ') continue
    const s = opts.each ? opts.each(g, glyphs.length) : {}
    if (s === null) continue
    const alpha = s.alpha ?? 1
    if (alpha <= 0.002) continue
    ctx.save()
    ctx.globalAlpha *= alpha
    ctx.translate(x0 + g.cx + (s.dx ?? 0), opts.y + (s.dy ?? 0))
    if (s.rotate) ctx.rotate((s.rotate * Math.PI) / 180)
    if (s.scale != null && s.scale !== 1) ctx.scale(s.scale, s.scale)
    if (s.glow) {
      ctx.shadowBlur = s.glow
      ctx.shadowColor = s.glowColor ?? s.color ?? opts.color
    }
    ctx.fillStyle = s.color ?? opts.color
    ctx.fillText(g.ch, -g.width / 2, 0)
    ctx.restore()
  }
  ctx.restore()
  return glyphs.map((g) => ({ ...g, x: g.x + x0, cx: g.cx + x0 }))
}

/**
 * 发光描边：同一条路径先用宽而淡的笔加 shadowBlur 画一遍光晕，再画实线。
 * 用 globalCompositeOperation='lighter' 叠很多段会出现串珠状亮点，这个写法没有。
 */
export function strokeGlow(
  ctx: Canvas2D,
  path: (ctx: Canvas2D) => void,
  opts: { color: string; width: number; glow?: number; alpha?: number; core?: string },
): void {
  const alpha = opts.alpha ?? 1
  if (alpha <= 0.002) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  path(ctx)
  ctx.shadowBlur = opts.glow ?? 24
  ctx.shadowColor = rgba(opts.color, 0.9 * alpha)
  ctx.strokeStyle = rgba(opts.color, 0.55 * alpha)
  ctx.lineWidth = opts.width * 2.2
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = rgba(opts.core ?? opts.color, alpha)
  ctx.lineWidth = opts.width
  ctx.stroke()
  ctx.restore()
}

/** 径向光点。 */
export function glowDot(ctx: Canvas2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (alpha <= 0.002 || r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.35, rgba(color, alpha * 0.35))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

export type TextPointsOptions = {
  font: string
  width: number
  height: number
  /** 采样间距，像素。越小点越多。 */
  step?: number
  /** 文字中心。默认画布中心。 */
  x?: number
  y?: number
  letterSpacing?: number
}

/**
 * 把文字栅格化后采样成点，粒子聚字、点阵标题用。在 setup 里调用（需要字体已加载），结果缓存起来。
 * 返回点按 x 升序。
 */
export function sampleTextPoints(str: string, opts: TextPointsOptions): Array<[number, number]> {
  const c = createCanvas(opts.width, opts.height)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.font = opts.font
  ctx.textBaseline = 'middle'
  const { glyphs, width } = measureGlyphs(ctx, str, opts.letterSpacing ?? 0)
  const x0 = (opts.x ?? opts.width / 2) - width / 2
  const y = opts.y ?? opts.height / 2
  for (const g of glyphs) ctx.fillText(g.ch, x0 + g.x, y)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  const step = opts.step ?? 4
  const pts: Array<[number, number]> = []
  for (let py = 0; py < c.height; py += step) {
    for (let px = 0; px < c.width; px += step) {
      if (data[(py * c.width + px) * 4 + 3]! > 128) pts.push([px, py])
    }
  }
  return pts.sort((a, b) => a[0] - b[0])
}
