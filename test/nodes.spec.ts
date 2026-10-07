import { type FvgNode } from 'flexlayer'
import { describe, expect, it } from 'vitest'
import { defineComposition } from '../src/composition.js'
import { camera, css, fx, place, typewriter } from '../src/nodes.js'
import { renderRgba } from '../src/render/frame.js'

const W = 400
const H = 200

/** 读一个像素的 RGB。 */
async function pixel(node: FvgNode, x: number, y: number): Promise<[number, number, number]> {
  const comp = defineComposition({ width: W, height: H, duration: 1, background: '#000000', render: () => node })
  const { rgba, width } = await renderRgba(comp, 0)
  const i = (y * width + x) * 4
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]
}

const dot = (x: number, y: number) =>
  fx({ x, y, width: 10, height: 10 }, (ctx) => {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 10, 10)
  })

describe('css', () => {
  it('驼峰转短横线，数字加 px，无单位属性除外', () => {
    expect(css({ fontSize: 24, fontWeight: 800, opacity: 0.5, letterSpacing: '0.1em' })).toBe(
      'font-size:24px; font-weight:800; opacity:0.5; letter-spacing:0.1em',
    )
    expect(css('color:red')).toBe('color:red')
    expect(css(undefined)).toBeUndefined()
  })
})

describe('place', () => {
  it('几乎透明时返回 null，整棵子树不进文档', () => {
    expect(place({ x: 0, y: 0, opacity: 0.001 })).toBeNull()
    expect(place({ x: 1.23456, y: 2 })!.attrs.x).toBe('1.23')
  })
})

describe('typewriter', () => {
  it('没打出来的字保留占位', () => {
    const n = typewriter('abcd', 2)
    const spans = n.children as FvgNode[]
    expect(spans.length).toBe(2)
    expect(String(spans[1]!.attrs.style)).toContain('rgba(0,0,0,0)')
  })
})

describe('camera', () => {
  it('不动时世界坐标就是屏幕坐标', async () => {
    expect(await pixel(camera({ width: W, height: H }, dot(100, 50)), 100, 50)).toEqual([255, 0, 0])
  })

  it('对准 (x, y) 并放大：该点落在画面中心，尺寸按 zoom 放大', async () => {
    const node = camera({ width: W, height: H, x: 300, y: 50, zoom: 2 }, dot(300, 50))
    expect(await pixel(node, W / 2, H / 2)).toEqual([255, 0, 0])
    expect(await pixel(node, W / 2 + 8, H / 2)).toEqual([255, 0, 0])
    expect(await pixel(node, W / 2 + 14, H / 2)).toEqual([0, 0, 0])
  })

  it('震屏是屏幕空间偏移，不受 zoom 影响', async () => {
    const node = camera({ width: W, height: H, x: 300, y: 50, zoom: 4, shakeX: 30 }, dot(300, 50))
    expect(await pixel(node, W / 2 + 30, H / 2)).toEqual([255, 0, 0])
  })

  it('只用一层 layer，绕目标点旋转时目标仍在中心', async () => {
    const node = camera({ width: W, height: H, x: 300, y: 50, zoom: 2, rotate: 30 }, dot(300, 50))
    expect(node.children.every((c) => typeof c !== 'object' || (c as FvgNode).tag !== 'layer')).toBe(true)
    expect(node.attrs.origin).toBe('300 50')
    expect(await pixel(node, W / 2, H / 2)).toEqual([255, 0, 0])
  })
})

describe('place origin', () => {
  it('数对写成 "x y"，这一点在缩放时不动', async () => {
    const n = place({ x: 0, y: 0, anchor: 'top-left', width: W, height: H, origin: [40, 30], scale: 3 }, dot(40, 30))
    expect(n!.attrs.origin).toBe('40 30')
    expect(await pixel(n!, 40, 30)).toEqual([255, 0, 0])
    expect(await pixel(n!, 40 + 14, 30)).toEqual([255, 0, 0])
  })
})
