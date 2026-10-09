import type { FvgNode } from 'flexlayer'
import { createElement as e, createContext, useContext, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { frameAt, defineComposition } from '../src/composition.js'
import { Place, Raw, Sequence, fromReact, renderToFvg, useFrame } from '../src/react/index.js'
import { shot, text } from '../src/nodes.js'

const comp = defineComposition({ id: 'r', width: 100, height: 100, duration: 10, render: () => null })

describe('renderToFvg', () => {
  it('draw 闭包原样保留', () => {
    const draw = () => {}
    const [n] = renderToFvg(e('layer', { width: 10 }, e('fx', { draw, width: 5 }))) as FvgNode[]
    expect(n!.tag).toBe('layer')
    expect((n!.children[0] as FvgNode).draw).toBe(draw)
  })

  it('非 draw 的函数 prop 报错', () => {
    expect(() => renderToFvg(e('layer', { onClick: () => {} } as never))).toThrow(/draw/)
  })

  it('style 对象转字符串，true 转成 "true"，false 丢弃', () => {
    const [n] = renderToFvg(e('p', { style: { fontSize: 20 }, glow: true, hidden: false } as never, 'hi')) as FvgNode[]
    expect(n!.attrs).toEqual({ style: 'font-size:20px', glow: 'true' })
    expect(n!.children).toEqual(['hi'])
  })

  it('context 正常工作', () => {
    const Theme = createContext('red')
    const Label = () => e('p', { color: useContext(Theme) })
    const [n] = renderToFvg(e(Theme.Provider, { value: 'blue' }, e(Label))) as FvgNode[]
    expect(n!.attrs.color).toBe('blue')
  })

  it('镜头写成两层 layer：view 和舞台属性原样传下去', () => {
    const cam = shot({ width: 100, height: 100, x: 30, y: 40, zoom: 2, rotate: 5 })
    const [n] = renderToFvg(e('layer', { width: 100, height: 100, view: cam.view }, e('layer', cam.stage))) as FvgNode[]
    expect(n!.attrs.view).toBe(cam.view)
    expect((n!.children[0] as FvgNode).attrs).toMatchObject({ origin: '30 40', rotate: '5' })
  })

  it('Raw 插入核心节点', () => {
    const [n] = renderToFvg(e('layer', null, e(Raw, { node: text('x') }))) as FvgNode[]
    expect((n!.children[0] as FvgNode).tag).toBe('p')
  })
})

describe('fromReact 与 Sequence', () => {
  function Clock(): ReactElement {
    const f = useFrame()
    return e('p', { t: f.t, g: f.globalT })
  }
  const render = fromReact(
    e('layer', null, e(Sequence, { from: 2, duration: 3 }, e(Clock)), e(Sequence, { from: 1 }, e(Sequence, { from: 1 }, e(Clock)))),
  )

  it('片段内 t 从 0 开始，globalT 是全片时间；嵌套的 from 累加', () => {
    const [root] = render(frameAt(comp, 3)) as FvgNode[]
    const [a, b] = root!.children as FvgNode[]
    expect(a!.attrs).toEqual({ t: '1', g: '3' })
    expect(b!.attrs).toEqual({ t: '1', g: '3' })
  })

  it('片段外不渲染', () => {
    const [root] = render(frameAt(comp, 6)) as FvgNode[]
    expect((root!.children as FvgNode[]).length).toBe(1)
  })

  it('Place 透明时整个子树消失', () => {
    expect(renderToFvg(e(Place, { x: 0, y: 0, opacity: 0 }, e('p', null, 'x')))).toEqual([])
  })
})
