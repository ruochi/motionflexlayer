import { h, type DrawFn, type FvgChild, type FvgNode } from 'flexlayer'
import { clamp, r2 } from './math.js'

export { h }
export type { DrawFn, FvgChild, FvgNode }

export type Anchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** 子元素可以是 null / false：条件渲染直接写 `cond && node`。 */
export type Child = FvgChild | null | undefined | false

export type StyleValue = string | number | null | undefined | false
export type StyleObject = Record<string, StyleValue>

const UNITLESS = new Set(['opacity', 'font-weight', 'line-height', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'order'])

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

/** 样式对象 → flexlayer 的 style 字符串。数字自动补 px（opacity、font-weight 等除外）。 */
export function css(style: StyleObject | string | undefined): string | undefined {
  if (style == null || typeof style === 'string') return style
  const parts: string[] = []
  for (const [k, v] of Object.entries(style)) {
    if (v == null || v === false) continue
    const key = kebab(k)
    const val = typeof v === 'number' ? (UNITLESS.has(key) ? String(r2(v)) : `${r2(v)}px`) : v
    parts.push(`${key}:${val}`)
  }
  return parts.join('; ')
}

export type Origin = Anchor | string | readonly [number, number]

/** origin 写成 flexlayer 的属性值。数对四舍五入到 0.01px。 */
export function originAttr(origin: Origin | undefined): string | undefined {
  if (origin == null || origin === 'center') return undefined
  if (typeof origin === 'string') return origin
  return `${r2(origin[0])} ${r2(origin[1])}`
}

export type PlaceOptions = {
  x: number
  y: number
  /** 定位点落在元素的哪里。默认 center。 */
  anchor?: Anchor
  opacity?: number
  /** 度。 */
  rotate?: number
  scale?: number
  /**
   * 旋转、缩放的支点，默认 center。九宫格，或这一层盒子里的一点：
   * `[120, 80]`、`'30% 40%'`、`'top 80'`。这一点在画面上不动。
   */
  origin?: Origin
  width?: number
  height?: number
  id?: string
  /** layer 上的其它属性：glow、blur、blend、overflow…… */
  attrs?: Record<string, string | number | undefined>
}

/**
 * 把内容放到 (x, y)，带透明度、旋转、缩放。返回 layer。
 * 透明度几乎为 0 时返回 null，整棵子树不进文档，省掉排版和绘制。
 */
export function place(opts: PlaceOptions, ...children: Child[]): FvgNode | null {
  const opacity = opts.opacity ?? 1
  if (opacity <= 0.002) return null
  return h(
    'layer',
    {
      id: opts.id,
      x: r2(opts.x),
      y: r2(opts.y),
      anchor: opts.anchor === 'top-left' ? undefined : (opts.anchor ?? 'center'),
      width: opts.width,
      height: opts.height,
      opacity: opacity < 1 ? r2(clamp(opacity) * 1000) / 1000 : undefined,
      rotate: opts.rotate ? r2(opts.rotate) : undefined,
      scale: opts.scale != null && opts.scale !== 1 ? Math.round(opts.scale * 10000) / 10000 : undefined,
      origin: originAttr(opts.origin),
      ...opts.attrs,
    },
    ...children,
  )
}

/** 单行文字。默认不换行，动画里文字宽度变化不该触发重排。 */
export function text(content: string, style?: StyleObject | string, tag: 'p' | 'h1' | 'h2' | 'h3' | 'span' = 'p'): FvgNode {
  const s = css(style)
  return h(tag, { style: s ? `white-space:nowrap; ${s}` : 'white-space:nowrap' }, content)
}

/** flex 容器。 */
export function box(style: StyleObject | string, ...children: Child[]): FvgNode {
  return h('div', { style: css(style) }, ...children)
}

export type FxOptions = {
  width: number
  height: number
  /** 中心点，默认画布中心。 */
  x?: number
  y?: number
  /** 自定义标签名。报告和问题路径里显示它，方便定位。 */
  name?: string
  id?: string
}

/**
 * 一块全画布（或指定大小）的绘图层。draw 在 (0,0)-(width,height) 的坐标里画。
 * 绘图模式是像素的出口：粒子、笔触、光效、数据图都在这里。
 */
export function fx(opts: FxOptions, draw: DrawFn): FvgNode {
  return h(opts.name ?? 'fx', {
    id: opts.id,
    x: r2(opts.x ?? opts.width / 2),
    y: r2(opts.y ?? opts.height / 2),
    anchor: 'center',
    width: opts.width,
    height: opts.height,
    draw,
  })
}

export type ShotOptions = {
  /** 取景窗大小，成片像素。 */
  width: number
  height: number
  /** 舞台大小。默认和取景窗一样大。 */
  stage?: readonly [number, number]
  /** 对准的舞台坐标，落在取景窗中心。默认舞台中心。 */
  x?: number
  y?: number
  /** 推近倍数。舞台 1px 在屏幕上是 zoom px。 */
  zoom?: number
  /** 舞台绕 (x, y) 转，度。取景窗本身不转。 */
  rotate?: number
  /** 屏幕空间偏移，成片像素，震屏用。不受 zoom 影响。 */
  shakeX?: number
  shakeY?: number
  /**
   * 震屏、旋转或对准舞台边缘时，取景会露出舞台外面，flexlayer 报 `view-outside`。
   * 默认把 zoom 抬到刚好盖满。写 false 保留原倍数。
   */
  cover?: boolean
}

export type Shot = {
  /** 写在取景窗那层的 `view`。 */
  view: string
  /** 舞台那层的属性：宽高，有旋转时带 rotate 和 origin。 */
  stage: { width: number; height: number; rotate?: number; origin?: string }
  /** 实际倍数。cover 抬过时比传入的大。 */
  zoom: number
  /** 舞台坐标 → 取景窗里的成片像素。取景窗不在 (0, 0) 时再加上它的 x、y。 */
  toScreen(x: number, y: number): [number, number]
}

const fmt3 = (n: number) => String(Math.round(n * 1000) / 1000)

/**
 * 镜头取景：对准舞台上任意一点，推近、旋转、震屏，算出 `view` 和舞台层的属性。
 * 结构由调用方自己写，取景窗多大、放在哪、几个窗口取同一个舞台都可以：
 *
 * ```ts
 * const cam = shot({ width: W, height: H, x, y, zoom })
 * h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, ...scene))
 * ```
 *
 * 章节、字幕、标注写在取景窗外面，用成片像素；要跟住舞台上的一点就用 `toScreen`。
 */
export function shot(opts: ShotOptions): Shot {
  const { width: W, height: H } = opts
  const [SW, SH] = opts.stage ?? [W, H]
  const x = opts.x ?? SW / 2
  const y = opts.y ?? SH / 2
  const rotate = opts.rotate ?? 0
  const sx = opts.shakeX ?? 0
  const sy = opts.shakeY ?? 0
  let zoom = opts.zoom ?? 1
  const rad = (rotate * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  if (opts.cover !== false) {
    // 取景四角 = (x, y) + d / zoom。转回舞台未旋转的坐标里，每个角每个轴都要落在 [0, 舞台] 里，各给 1/zoom 一个上限。
    let most = Infinity
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const dx = (cx * W) / 2 - sx
      const dy = (cy * H) / 2 - sy
      const ux = cos * dx + sin * dy
      const uy = -sin * dx + cos * dy
      if (ux > 1e-9) most = Math.min(most, (SW - x) / ux)
      if (ux < -1e-9) most = Math.min(most, x / -ux)
      if (uy > 1e-9) most = Math.min(most, (SH - y) / uy)
      if (uy < -1e-9) most = Math.min(most, y / -uy)
    }
    if (most > 0 && Number.isFinite(most)) zoom = Math.max(zoom, 1 / most)
  }

  const vw = W / zoom
  const vh = H / zoom
  const vx = x - sx / zoom - vw / 2
  const vy = y - sy / zoom - vh / 2
  return {
    view: `${fmt3(vx)} ${fmt3(vy)} ${fmt3(vw)} ${fmt3(vh)}`,
    stage: rotate ? { width: SW, height: SH, rotate: r2(rotate), origin: originAttr([x, y]) } : { width: SW, height: SH },
    zoom,
    toScreen(px, py) {
      const dx = px - x
      const dy = py - y
      const qx = x + cos * dx - sin * dy
      const qy = y + sin * dx + cos * dy
      return [(qx - vx) * zoom, (qy - vy) * zoom]
    },
  }
}

export type RollOptions = {
  /** 当前位置，小数。0 显示第一项，1 显示第二项，中间是滚动过程。配合 springSteps。 */
  value: number
  /** 每一项的高度（axis='x' 时为宽度）。 */
  cell: number
  /** 窗口宽度（axis='x' 时为高度）。 */
  size: number
  axis?: 'x' | 'y'
  /** 交叉方向的对齐。 */
  align?: 'start' | 'center' | 'end'
}

/** roll 的四层结构：窗口、滑动层、flex 列、每格。React 版共用它。 */
export function rollLayout(opts: RollOptions) {
  const vertical = (opts.axis ?? 'y') === 'y'
  const align = opts.align ?? 'start'
  const crossAt = align === 'start' ? 0 : align === 'center' ? opts.size / 2 : opts.size
  const anchor = vertical
    ? align === 'start' ? 'top-left' : align === 'center' ? 'top' : 'top-right'
    : align === 'start' ? 'top-left' : align === 'center' ? 'left' : 'bottom-left'
  return {
    window: { width: vertical ? opts.size : opts.cell, height: vertical ? opts.cell : opts.size, overflow: 'hidden' },
    slider: {
      x: vertical ? crossAt : r2(-opts.value * opts.cell),
      y: vertical ? r2(-opts.value * opts.cell) : crossAt,
      anchor,
    },
    column: { style: `display:flex; flex-direction:${vertical ? 'column' : 'row'}; align-items:${align}` },
    cell: {
      style: vertical
        ? `height:${opts.cell}px; display:flex; align-items:center`
        : `width:${opts.cell}px; display:flex; justify-content:center`,
    },
  }
}

/** 滚动窗口：一列内容在固定窗口里滚动。计数器、标签切换、老虎机数字。 */
export function roll(opts: RollOptions, items: Child[]): FvgNode {
  const L = rollLayout(opts)
  return h(
    'layer',
    L.window,
    h('layer', L.slider, h('div', L.column, ...items.map((it) => h('div', L.cell, it)))),
  )
}

export type RevealOptions = {
  /** 0..1。 */
  progress: number
  width: number
  height: number
  /** 擦除前进的方向。 */
  direction?: 'right' | 'left' | 'down' | 'up'
  /** 羽化宽度，占擦除长度的比例。 */
  feather?: number
}

/** 蒙版擦除：内容沿方向逐渐露出，边缘带羽化。标题、线条、图片入场。 */
export function reveal(opts: RevealOptions, ...children: Child[]): FvgNode | null {
  const p = clamp(opts.progress)
  if (p <= 0) return null
  const dir = opts.direction ?? 'right'
  const feather = opts.feather ?? 0.14
  const { width: W, height: H } = opts
  const horizontal = dir === 'right' || dir === 'left'
  const len = horizontal ? W : H
  const travel = p * len * (1 + feather)
  const solid = `${r2((1 - feather) * 100)}%`
  let rect: Record<string, number | string>
  if (dir === 'right') rect = { x: 0, y: 0, width: travel, height: H, fill: `linear-gradient(to right, #fff 0%, #fff ${solid}, #fff0 100%)` }
  else if (dir === 'left') rect = { x: W - travel, y: 0, width: travel, height: H, fill: `linear-gradient(to left, #fff 0%, #fff ${solid}, #fff0 100%)` }
  else if (dir === 'down') rect = { x: 0, y: 0, width: W, height: travel, fill: `linear-gradient(to bottom, #fff 0%, #fff ${solid}, #fff0 100%)` }
  else rect = { x: 0, y: H - travel, width: W, height: travel, fill: `linear-gradient(to top, #fff 0%, #fff ${solid}, #fff0 100%)` }
  for (const k of ['x', 'y', 'width', 'height']) rect[k] = r2(rect[k] as number)
  return h('layer', { width: W, height: H }, h('mask', {}, h('rect', rect)), ...children)
}

export type Token = string | [text: string, color: string]

/**
 * 打字机：显示前 shown 个字符。没打出来的部分保留为透明文字占位，
 * 整行宽度从第一帧就固定，居中排版不会随打字左右漂。
 */
export function typewriter(tokens: string | Token[], shown: number, style?: StyleObject | string): FvgNode {
  const list: Array<[string, string | undefined]> = (typeof tokens === 'string' ? [tokens] : tokens).map((tk) =>
    typeof tk === 'string' ? [tk, undefined] : tk,
  )
  let left = Math.max(0, Math.floor(shown))
  const spans: FvgNode[] = []
  for (const [tok, color] of list) {
    const vis = Math.max(0, Math.min(tok.length, left))
    left -= vis
    if (vis > 0) spans.push(h('span', { style: color ? `color:${color}` : undefined }, tok.slice(0, vis)))
    if (vis < tok.length) spans.push(h('span', { style: 'color:rgba(0,0,0,0)' }, tok.slice(vis)))
  }
  const s = css(style)
  return h('p', { style: s ? `white-space:nowrap; ${s}` : 'white-space:nowrap' }, ...spans)
}

/** 按 token 拼起来的总字符数。 */
export function tokenLength(tokens: Token[]): number {
  return tokens.reduce((n, tk) => n + (typeof tk === 'string' ? tk.length : tk[0].length), 0)
}
