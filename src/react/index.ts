import { createContext, createElement as e, Fragment, useContext, type ReactElement, type ReactNode } from 'react'
import type { DrawFn, FvgChild, FvgNode } from 'flexlayer'
import type { Frame } from '../composition.js'
import {
  camera,
  css,
  place,
  reveal,
  rollLayout,
  type CameraOptions,
  type PlaceOptions,
  type RevealOptions,
  type RollOptions,
  type StyleObject,
} from '../nodes.js'
import type { Timeline } from '../timeline.js'
import { RAW_TAG, renderToFvg } from './reconciler.js'

export { renderToFvg, RAW_TAG }
export type { FvgIntrinsicElements, LayerProps, CustomProps, FvgCommon } from './jsx.js'

/** React 组件里拿到的帧。在 <Sequence> 里 t、frame、progress 都是相对片段的，globalT 是全片时间。 */
export type ReactFrame = Frame & { globalT: number; from: number }

const FrameContext = createContext<ReactFrame | null>(null)

/** 当前帧。必须在 fromReact 渲染的树里调用。 */
export function useFrame(): ReactFrame {
  const f = useContext(FrameContext)
  if (!f) throw new Error('useFrame 只能在 fromReact(...) 渲染的组件里调用')
  return f
}

/** 当前时间（秒）。在 <Sequence> 里是片段内的局部时间。 */
export const useTime = () => useFrame().t

export const useTimeline = (): Timeline => useFrame().tl

export type SequenceProps = {
  /** 从全片第几秒开始，秒。 */
  from: number
  /** 持续多久，秒。缺省到片尾。 */
  duration?: number
  children?: ReactNode
}

/**
 * 时间片段：只在 [from, from + duration) 内渲染，里面的 useFrame().t 从 0 开始。
 * 把一段动画写成从 0 开始的组件，再用 Sequence 摆到时间轴上，组件就能复用、挪动。
 */
export function Sequence({ from, duration, children }: SequenceProps): ReactElement | null {
  const f = useFrame()
  const start = f.from + from
  const local = f.globalT - start
  const len = duration ?? f.duration - from
  if (local < 0 || local >= len) return null
  const value: ReactFrame = {
    ...f,
    t: local,
    frame: Math.round(local * f.fps),
    duration: len,
    progress: len > 0 ? local / len : 1,
    from: start,
  }
  return e(FrameContext.Provider, { value }, children)
}

/**
 * 用 React 写帧：defineComposition({ render: fromReact(<Scene />) })。
 * 也可以传函数 (f) => <Scene … />。小写标签是 flexlayer 元素，draw={fn} 闭包原样保留。
 */
export function fromReact(app: ReactElement | ((f: Frame) => ReactElement)): (f: Frame) => FvgChild[] {
  return (f) => {
    const value: ReactFrame = { ...f, globalT: f.t, from: 0 }
    const el = typeof app === 'function' ? app(f) : app
    return renderToFvg(e(FrameContext.Provider, { value }, el))
  }
}

/** 原样插入核心 API 生成的节点：<Raw node={typewriter(...)} />。 */
export function Raw({ node }: { node: FvgChild | FvgChild[] | null | undefined }): ReactElement {
  return e(RAW_TAG, { node })
}

export type PlaceProps = PlaceOptions & { children?: ReactNode }

/** 见核心的 place()。 */
export function Place({ children, ...opts }: PlaceProps): ReactElement | null {
  const n = place(opts)
  return n ? e('layer', n.attrs, children) : null
}

export type FxProps = {
  draw: DrawFn
  /** 默认整个画布。 */
  width?: number
  height?: number
  x?: number
  y?: number
  name?: string
  id?: string
}

/** 见核心的 fx()。默认铺满画布。 */
export function Fx({ draw, width, height, x, y, name, id }: FxProps): ReactElement {
  const f = useFrame()
  const w = width ?? f.width
  const hh = height ?? f.height
  return e(name ?? 'fx', { id, x: x ?? w / 2, y: y ?? hh / 2, anchor: 'center', width: w, height: hh, draw })
}

export type CameraProps = Omit<CameraOptions, 'width' | 'height'> & { width?: number; height?: number; children?: ReactNode }

/** 见核心的 camera()。 */
export function Camera({ children, width, height, ...opts }: CameraProps): ReactElement {
  const f = useFrame()
  const n = camera({ ...opts, width: width ?? f.width, height: height ?? f.height })
  const inner = n.children[0] as FvgNode
  return e('layer', n.attrs, e('layer', inner.attrs, children))
}

export type RevealProps = RevealOptions & { children?: ReactNode }

/** 见核心的 reveal()。 */
export function Reveal({ children, ...opts }: RevealProps): ReactElement | null {
  const n = reveal(opts)
  if (!n) return null
  return e('layer', n.attrs, e(RAW_TAG, { node: n.children[0] }), children)
}

export type RollProps = RollOptions & { items: ReactNode[] }

/** 见核心的 roll()。 */
export function Roll({ items, ...opts }: RollProps): ReactElement {
  const L = rollLayout(opts)
  return e(
    'layer',
    L.window,
    e('layer', L.slider, e('div', L.column, ...items.map((it, i) => e('div', { ...L.cell, key: i }, it)))),
  )
}

export type TextProps = { style?: StyleObject | string; as?: 'p' | 'h1' | 'h2' | 'h3' | 'span'; children?: ReactNode }

/** 单行文字，默认不换行。 */
export function Text({ style, as = 'p', children }: TextProps): ReactElement {
  const s = css(style)
  return e(as, { style: s ? `white-space:nowrap; ${s}` : 'white-space:nowrap' }, children)
}

/** flex 容器。 */
export function Box({ style, children }: { style?: StyleObject | string; children?: ReactNode }): ReactElement {
  return e('div', { style: css(style) }, children)
}

export { Fragment }
