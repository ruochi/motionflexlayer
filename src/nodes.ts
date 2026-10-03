import { h, type DrawFn, type FvgChild, type FvgNode } from '@dc/flexlayer'
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

export type PlaceOptions = {
  x: number
  y: number
  /** 定位点落在元素的哪里。默认 center。 */
  anchor?: Anchor
  opacity?: number
  /** 度。 */
  rotate?: number
  scale?: number
  /** 旋转、缩放的支点。目前只支持九宫格，见 docs/FLEXLAYER-CHANGES.md。 */
  origin?: Anchor
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
      cx: r2(opts.x),
      cy: r2(opts.y),
      anchor: opts.anchor && opts.anchor !== 'center' ? opts.anchor : undefined,
      width: opts.width,
      height: opts.height,
      opacity: opacity < 1 ? r2(clamp(opacity) * 1000) / 1000 : undefined,
      rotate: opts.rotate ? r2(opts.rotate) : undefined,
      scale: opts.scale != null && opts.scale !== 1 ? Math.round(opts.scale * 10000) / 10000 : undefined,
      origin: opts.origin && opts.origin !== 'center' ? opts.origin : undefined,
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
    cx: r2(opts.x ?? opts.width / 2),
    cy: r2(opts.y ?? opts.height / 2),
    width: opts.width,
    height: opts.height,
    draw,
  })
}

export type CameraOptions = {
  /** 画布大小。 */
  width: number
  height: number
  /** 镜头对准的世界坐标，落在画面中心。默认画布中心，即不动。 */
  x?: number
  y?: number
  /** 绕镜头中心缩放。 */
  zoom?: number
  /** 绕镜头中心旋转，度。 */
  rotate?: number
  /** 屏幕空间偏移，震屏用。不受 zoom 影响。 */
  shakeX?: number
  shakeY?: number
}

/**
 * 镜头：对准任意世界坐标，绕它缩放、旋转，再叠加屏幕空间的震动。
 * 子元素照常用画布坐标摆放。
 *
 * 实现：外层 2W×2H、origin 居中，内层把世界坐标 (x, y) 移到外层中心。
 * flexlayer 的 origin 只有九宫格，这是绕任意点缩放的标准写法。
 * 镜头里不要放 blur / mask / grade：它们按缩放后的尺寸开离屏画布，zoom 很大时极慢。
 */
export function camera(opts: CameraOptions, ...children: Child[]): FvgNode {
  const { width: W, height: H } = opts
  const x = opts.x ?? W / 2
  const y = opts.y ?? H / 2
  const zoom = opts.zoom ?? 1
  return h(
    'layer',
    {
      cx: r2(W / 2 + (opts.shakeX ?? 0)),
      cy: r2(H / 2 + (opts.shakeY ?? 0)),
      width: W * 2,
      height: H * 2,
      scale: zoom !== 1 ? Math.round(zoom * 10000) / 10000 : undefined,
      rotate: opts.rotate ? r2(opts.rotate) : undefined,
    },
    h('layer', { cx: r2(W - x), cy: r2(H - y), anchor: 'top-left', width: W, height: H }, ...children),
  )
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
      cx: vertical ? crossAt : r2(-opts.value * opts.cell),
      cy: vertical ? r2(-opts.value * opts.cell) : crossAt,
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
  if (dir === 'right') rect = { x1: 0, y1: 0, x2: travel, y2: H, fill: `linear-gradient(to right, #fff 0%, #fff ${solid}, #fff0 100%)` }
  else if (dir === 'left') rect = { x1: W - travel, y1: 0, x2: W, y2: H, fill: `linear-gradient(to left, #fff 0%, #fff ${solid}, #fff0 100%)` }
  else if (dir === 'down') rect = { x1: 0, y1: 0, x2: W, y2: travel, fill: `linear-gradient(to bottom, #fff 0%, #fff ${solid}, #fff0 100%)` }
  else rect = { x1: 0, y1: H - travel, x2: W, y2: H, fill: `linear-gradient(to top, #fff 0%, #fff ${solid}, #fff0 100%)` }
  for (const k of ['x1', 'y1', 'x2', 'y2']) rect[k] = r2(rect[k] as number)
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
