import { h, type DrawFn, type FvgChild, type FvgNode } from '@dc/flexlayer'

type Child = FvgChild | number | boolean | null | undefined | Child[]

export type FlexProps = {
  key?: string | number
  draw?: DrawFn
  style?: string
  children?: Child
  [attr: string]: unknown
}

type Component<P> = (props: P) => FvgNode | null

export const Fragment = Symbol('Fragment')

function flatten(children: Child, out: FvgChild[] = []): FvgChild[] {
  if (Array.isArray(children)) {
    for (const c of children) flatten(c, out)
  } else if (typeof children === 'number') {
    out.push(String(children))
  } else if (typeof children === 'string' || (children != null && typeof children === 'object')) {
    out.push(children)
  }
  return out
}

/**
 * flexlayer's own runtime only accepts lowercase tag names. This one also expands
 * function components and fragments, so scenes can be split into components.
 */
export function jsx(tag: string | symbol | Component<any>, props: FlexProps): FvgNode {
  const { children, key: _key, ...rest } = props ?? {}
  if (tag === Fragment) return flatten(children) as unknown as FvgNode
  if (typeof tag === 'function') return tag({ ...rest, children }) as FvgNode
  return h(tag as string, rest, ...flatten(children))
}

export const jsxs = jsx
export const jsxDEV = jsx

export namespace JSX {
  export type Element = FvgNode
  export interface ElementChildrenAttribute {
    children: {}
  }
  export interface IntrinsicAttributes {
    key?: string | number
  }
  export interface IntrinsicElements {
    [tag: string]: FlexProps
  }
}
