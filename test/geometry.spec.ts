import type { Glyph } from 'flexlayer'
import { describe, expect, it } from 'vitest'
import { edgeRoom, expects, glyphBounds, mapBounds, pathLength, poseBounds, unionBounds } from '../src/geometry.js'
import { placeGlyph, shot } from '../src/nodes.js'
import { runs } from '../src/text.js'

const near = (b: { left: number; top: number; right: number; bottom: number }) => [b.left, b.top, b.right, b.bottom].map((v) => Math.round(v * 1000) / 1000)

describe('bounds', () => {
  it('poseBounds 绕中心缩放、旋转后取外接框', () => {
    const local = { left: -20, top: -10, right: 20, bottom: 10 }
    expect(near(poseBounds(local, { x: 100, y: 50 }))).toEqual([80, 40, 120, 60])
    expect(near(poseBounds(local, { x: 100, y: 50, rotate: 90, scale: 2 }))).toEqual([80, 10, 120, 90])
  })

  it('mapBounds 可以直接用 cam.toScreen', () => {
    const cam = shot({ width: 400, height: 200, x: 100, y: 50, zoom: 2 })
    expect(near(mapBounds({ left: 90, top: 40, right: 110, bottom: 60 }, cam.toScreen))).toEqual([180, 80, 220, 120])
  })

  it('edgeRoom 是离画布四边最近的距离，伸出去为负', () => {
    expect(edgeRoom({ left: 10, top: 30, right: 380, bottom: 150 }, 400, 200)).toBe(10)
    expect(edgeRoom({ left: -5, top: 30, right: 100, bottom: 150 }, 400, 200)).toBe(-5)
    expect(unionBounds({ left: 0, top: 5, right: 10, bottom: 10 }, { left: -3, top: 8, right: 4, bottom: 20 })).toEqual({ left: -3, top: 5, right: 10, bottom: 20 })
  })

  it('glyphBounds 按着墨算，没有着墨数据时按字身', () => {
    const g = { width: 60, height: 80, ink: { x: 10, y: 20, width: 30, height: 40 } } as unknown as Glyph
    expect(near(glyphBounds(g, { x: 0, y: 0 }))).toEqual([-20, -20, 10, 20])
    expect(near(glyphBounds({ ...g, ink: undefined } as unknown as Glyph, { x: 0, y: 0 }))).toEqual([-30, -40, 30, 40])
  })
})

describe('expects', () => {
  it('只拼成立的预期，一条都没有时是 undefined', () => {
    expect(expects(false, 'a: x', undefined, 'b: y')).toBe('a: x; b: y')
    expect(expects(false, null)).toBeUndefined()
  })
})

describe('pathLength', () => {
  it('绝对和相对命令都按折线长度算', () => {
    expect(pathLength('M0 0 L10 0 L10 10 L0 10 Z')).toBeCloseTo(40)
    expect(pathLength('m5 5 l10 0 l0 10 l-10 0 z')).toBeCloseTo(40)
    expect(pathLength('M0 0 Q 50 0 100 0')).toBeCloseTo(100)
  })
})

describe('placeGlyph', () => {
  it('不给默认颜色，path 属性原样写入；透明时不输出', () => {
    const g = { d: 'M0 0 L1 1', width: 64, height: 64 } as unknown as Glyph
    const n = placeGlyph(g, { x: 10, y: 20, rotate: 5 }, { fill: '#abcdef' })!
    expect(n.attrs).toMatchObject({ x: '10', y: '20', anchor: 'center', width: '64', height: '64', rotate: '5' })
    const path = n.children[0] as { attrs: Record<string, unknown> }
    expect(path.attrs).toEqual({ d: 'M0 0 L1 1', stroke: 'none', fill: '#abcdef' })
    expect(placeGlyph(g, { x: 0, y: 0 })!.children[0]).not.toHaveProperty('attrs.fill')
    expect(placeGlyph(g, { x: 0, y: 0, opacity: 0 })).toBeNull()
  })
})

describe('runs', () => {
  it('相邻、key 相同的项并成一段', () => {
    const items = [...'ab，cd'].map((text, i) => ({ text, i }))
    const out = runs(items, (it) => (it.i < 3 ? 'on' : 'off'))
    expect(out.map((r) => [r.key, r.text, r.items.length])).toEqual([
      ['on', 'ab，', 3],
      ['off', 'cd', 2],
    ])
    expect(runs([], () => 1)).toEqual([])
  })
})
