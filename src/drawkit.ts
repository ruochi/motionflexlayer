import { createCanvas, DEFAULT_FONT, type Canvas2D } from './canvas.js'

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
