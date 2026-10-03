import { h, type FvgNode } from '@dc/flexlayer'
import { describe, expect, it } from 'vitest'
import { camera, css, fx, place, typewriter } from '../src/nodes.js'
import { renderRaw } from '../src/render/raw.js'

const W = 400
const H = 200

/** 读一个像素的 RGB。画面背景不透明，预乘与否不影响。 */
async function pixel(node: FvgNode, x: number, y: number): Promise<[number, number, number]> {
  const { rgba, width } = await renderRaw(h('layer', { width: W, height: H, background: '#000000' }, node), {})
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
    expect(place({ x: 1.23456, y: 2 })!.attrs.cx).toBe('1.23')
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
})
