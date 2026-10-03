import type { ReactNode } from 'react'
import type { DrawFn } from '@dc/flexlayer'
import type { StyleObject } from '../nodes.js'

type Num = number | string

/** 所有 flexlayer 元素共有的属性。style 可以写字符串，也可以写对象（数字自动补 px）。 */
export type FvgCommon = {
  id?: string
  style?: string | StyleObject
  /** 在元素自身内容画完之后调用，坐标原点是元素左上角。 */
  draw?: DrawFn
  children?: ReactNode
  key?: string | number
}

type Positioned = FvgCommon & {
  cx?: Num
  cy?: Num
  anchor?: string
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

type Shape = Positioned &
  Effects & {
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
    'font-family'?: string
    safe?: Num
    opacity?: Num
    rotate?: Num
    scale?: Num
    origin?: string
    overflow?: 'hidden' | 'visible'
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
  rect: Shape & Box4
  circle: Shape
  ellipse: Shape & Box4
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
