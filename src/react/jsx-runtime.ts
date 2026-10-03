import type * as React from 'react'
import type { FvgIntrinsicElements } from './jsx.js'

export { jsx, jsxs, Fragment } from 'react/jsx-runtime'

/**
 * 运行时就是 React 自己的 jsx；这里只换掉类型：小写标签是 flexlayer 元素而不是 DOM。
 * tsconfig 里设 "jsxImportSource": "motionflexlayer/react"。
 */
export namespace JSX {
  export type ElementType = React.JSX.ElementType
  export interface Element extends React.JSX.Element {}
  export interface ElementClass extends React.JSX.ElementClass {}
  export interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
  export interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
  export type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>
  export interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
  export interface IntrinsicClassAttributes<T> extends React.JSX.IntrinsicClassAttributes<T> {}
  export interface IntrinsicElements extends FvgIntrinsicElements {}
}
