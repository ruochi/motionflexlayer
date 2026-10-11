import type { ReactNode } from 'react'
import type { DrawFn } from 'flexlayer'
import type { StyleObject } from '../nodes.js'

type Num = number | string

/** 所有 flexlayer 元素共有的属性。style 可以写字符串，也可以写对象（数字自动补 px）。 */
export type FvgCommon = {
  id?: string
  style?: string | StyleObject
  /** 在元素自身内容画完之后调用，坐标原点是元素左上角。 */
  draw?: DrawFn
  /** 结构化数据，draw 里从 el.data 取。 */
  data?: unknown
  /** 预期中的问题，例如 "overflow-canvas: 出血入场"。命中的降为 info。 */
  expect?: string
  children?: ReactNode
  key?: string | number
}

/** x、y 是定位点，anchor 默认 top-left。 */
type Positioned = FvgCommon & {
  x?: Num
  y?: Num
  anchor?: string
  'anchor-box'?: 'box' | 'ink'
}

type Effects = {
  shadow?: string
  glow?: string
  'inner-shadow'?: string
  'inner-glow'?: string
  blur?: Num
  'backdrop-blur'?: Num
  glass?: string
  noise?: string
  filter?: string
  blend?: string
}

type Shape = FvgCommon &
  Effects & {
    x?: Num
    y?: Num
    cx?: Num
    cy?: Num
    r?: Num
    rx?: Num
    ry?: Num
    width?: Num
    height?: Num
    fill?: string
    stroke?: string
    'stroke-width'?: Num
    opacity?: Num
  }

type Box4 = { x1?: Num; y1?: Num; x2?: Num; y2?: Num }

export type LayerProps = Positioned &
  Effects & {
    width?: Num
    height?: Num
    /** 只在根上作为画布底色。 */
    background?: string
    color?: string
    perspective?: Num
    'font-family'?: string
    safe?: Num
    opacity?: Num
    rotate?: Num
    /** 只在带 perspective 的父层里生效。三维镜头里用 shot3d().pose() 算。 */
    rotateX?: Num
    rotateY?: Num
    z?: Num
    scale?: Num
    origin?: string
    overflow?: 'hidden' | 'visible'
    /** 舞台上被取的矩形 "x y w h"，这一层变成取景窗。用 shot() 或 zoomView() 算。 */
    view?: string
    overlay?: string
    grade?: string
    'grade-mask'?: string
  }

/** 自定义标签：带 draw 和宽高就是一个参与排版的绘图盒子，例如 <chart width={300} height={200} draw={…} />。 */
export type CustomProps = Positioned & Effects & { width?: Num; height?: Num; opacity?: Num } & Record<string, unknown>

export type FvgIntrinsicElements = {
  layer: LayerProps
  font: { family?: string; src?: string; key?: string | number }
  /** 字符串形式的绘图体，只有 ctx 和 el 可用。React 里更推荐 draw={fn} 属性。 */
  draw: FvgCommon
  symbol: FvgCommon & { width?: Num; height?: Num }
  /** 蒙版，只能是 layer 的直接子元素。里面的图形只取 alpha。 */
  mask: FvgCommon
  use: Positioned & { href?: string; rotate?: Num; scale?: Num }
  rect: Shape
  circle: Shape
  ellipse: Shape
  line: FvgCommon & Box4 & { stroke?: string; 'stroke-width'?: Num }
  arrow: FvgCommon & Box4 & { head?: Num; stroke?: string; 'stroke-width'?: Num }
  polyline: FvgCommon & { points?: string; stroke?: string; 'stroke-width'?: Num }
  polygon: FvgCommon & { points?: string; fill?: string; stroke?: string }
  path: FvgCommon & { d?: string; fill?: string; stroke?: string; 'stroke-width'?: Num }
  curve: FvgCommon & { points?: string; closed?: boolean | string; fill?: string; stroke?: string; 'stroke-width'?: Num }
  h1: FvgCommon
  h2: FvgCommon
  h3: FvgCommon
  p: FvgCommon
  div: FvgCommon
  span: FvgCommon
  strong: FvgCommon
  b: FvgCommon
  em: FvgCommon
  br: FvgCommon
  img: FvgCommon & { src?: string; alt?: string; width?: Num; height?: Num }
  image: FvgCommon & { src?: string; alt?: string; width?: Num; height?: Num }
  'mfl-raw': { node: unknown; key?: string | number }
  [custom: string]: CustomProps
}
