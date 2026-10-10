import { type FvgNode } from 'flexlayer'
import { describe, expect, it } from 'vitest'
import { defineComposition } from '../src/composition.js'
import { css, fx, h, place, shot, typewriter, type Shot } from '../src/nodes.js'
import { renderFrame, renderRgba } from '../src/render/frame.js'

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

  it('每段的样式由调用方给；占位部分保留字重等样式，只把颜色换成透明', () => {
    const n = typewriter([{ text: 'ab', style: { color: '#123456', fontWeight: 800 }, id: 'k' }, 'cd'], 1)
    const spans = n.children as FvgNode[]
    expect(spans.map((s) => s.attrs.style)).toEqual(['color:#123456; font-weight:800', 'font-weight:800; color:rgba(0,0,0,0)', 'color:rgba(0,0,0,0)'])
    expect(spans[0]!.attrs.id).toBe('k')
    const hidden = typewriter([{ text: 'ab', style: 'color:red; letter-spacing:2px' }], 0).children[0] as FvgNode
    expect(hidden.attrs.style).toBe('letter-spacing:2px; color:rgba(0,0,0,0)')
  })
})

describe('shot', () => {
  const frame = (cam: Shot, ...children: FvgNode[]) => h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, ...children))

  it('不动时舞台坐标就是屏幕坐标', async () => {
    const cam = shot({ width: W, height: H })
    expect(cam.view).toBe(`0 0 ${W} ${H}`)
    expect(await pixel(frame(cam, dot(100, 50)), 100, 50)).toEqual([255, 0, 0])
  })

  it('对准 (x, y) 并放大：该点落在画面中心，尺寸按 zoom 放大', async () => {
    const cam = shot({ width: W, height: H, x: 300, y: 80, zoom: 2 })
    const node = frame(cam, dot(300, 80))
    expect(await pixel(node, W / 2, H / 2)).toEqual([255, 0, 0])
    expect(await pixel(node, W / 2 + 8, H / 2)).toEqual([255, 0, 0])
    expect(await pixel(node, W / 2 + 14, H / 2)).toEqual([0, 0, 0])
    expect(cam.toScreen(300, 80)).toEqual([W / 2, H / 2])
  })

  it('震屏是屏幕空间偏移，不受 zoom 影响', async () => {
    const cam = shot({ width: W, height: H, x: 200, y: 100, zoom: 4, shakeX: 30 })
    expect(await pixel(frame(cam, dot(200, 100)), W / 2 + 30, H / 2)).toEqual([255, 0, 0])
    expect(cam.toScreen(200, 100)).toEqual([W / 2 + 30, H / 2])
  })

  it('对准舞台边缘或震屏时把 zoom 抬到刚好盖满，cover:false 保留原倍数', () => {
    expect(shot({ width: W, height: H, x: 300, y: 100 }).zoom).toBeCloseTo(2)
    expect(shot({ width: W, height: H, shakeX: 20 }).zoom).toBeCloseTo((W / 2 + 20) / (W / 2))
    expect(shot({ width: W, height: H, x: 300, y: 100, cover: false }).zoom).toBe(1)
  })

  it('舞台绕目标点旋转：目标仍在中心，toScreen 跟着转', async () => {
    const cam = shot({ width: W, height: H, x: 200, y: 100, zoom: 2, rotate: 30 })
    expect(cam.stage.origin).toBe('200 100')
    expect(await pixel(frame(cam, dot(200, 100)), W / 2, H / 2)).toEqual([255, 0, 0])
    const [sx, sy] = cam.toScreen(240, 100)
    expect(await pixel(frame(cam, dot(240, 100)), Math.round(sx), Math.round(sy))).toEqual([255, 0, 0])
    expect(sy).toBeGreaterThan(H / 2)
  })

  it('盖满时 flexlayer 不报 view-outside，不盖满时报', async () => {
    const issues = async (cam: Shot) => {
      const comp = defineComposition({ width: W, height: H, duration: 1, render: () => frame(cam, dot(200, 100)) })
      const { report } = await renderFrame(comp, 0, { scale: 0.25 })
      return report.issues.map((i) => i.code)
    }
    expect(await issues(shot({ width: W, height: H, zoom: 1.5, rotate: 12, shakeX: 9, shakeY: -6 }))).not.toContain('view-outside')
    expect(await issues(shot({ width: W, height: H, rotate: 12, cover: false }))).toContain('view-outside')
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
