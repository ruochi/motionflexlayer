import { describe, expect, it } from 'vitest'
import { auditFrames, formatFrames, type RgbaSample } from '../src/brand/frames.js'
import { auditPlan, formatPlan } from '../src/brand/plan.js'

function solid(w: number, h: number, rgb: [number, number, number], t: number): RgbaSample {
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[0]
    rgba[i * 4 + 1] = rgb[1]
    rgba[i * 4 + 2] = rgb[2]
    rgba[i * 4 + 3] = 255
  }
  return { t, width: w, height: h, rgba }
}

function blot(base: RgbaSample, x: number, y: number, w: number, h: number) {
  const px = new Uint8Array(base.rgba)
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const o = (yy * base.width + xx) * 4
      px[o] = 10
      px[o + 1] = 12
      px[o + 2] = 16
      px[o + 3] = 255
    }
  }
  return { ...base, rgba: px }
}

describe('品牌片计划闸门', () => {
  it('三份文件写完就过', () => {
    expect(auditPlan({ shotList: '分镜', copy: '文案', assets: '素材' })).toEqual([])
  })

  it('缺文件或还写着待填就失败', () => {
    const issues = auditPlan({ shotList: '待填', assets: '待填' })
    expect(issues.some((i) => i.file === 'shot-list.md' && i.message.includes('待填'))).toBe(true)
    expect(issues.some((i) => i.file === 'copy.md' && i.message.includes('没有文案出处'))).toBe(true)
    expect(issues.some((i) => i.file === 'assets.md' && i.message.includes('待填'))).toBe(true)
    expect(formatPlan(issues)).toMatch(/failed/)
  })
})

describe('品牌片画面闸门', () => {
  const ground = [232, 232, 232] as const

  it('空底过不了', () => {
    const frames = [0, 0.2, 0.4].map((t) => solid(40, 20, [232, 232, 232], t))
    const stats = auditFrames(frames, [{ name: 'only', from: 0, to: 1 }], ground)
    expect(stats.failed.length).toBeGreaterThan(0)
    expect(formatFrames(stats)).toMatch(/FAIL/)
  })

  it('在动的色块过得了', () => {
    const frames = [0, 0.2, 0.4, 0.6, 0.8].map((t, i) => blot(solid(48, 24, [232, 232, 232], t), 2 + i * 4, 2, 22, 18))
    const stats = auditFrames(frames, [{ name: 'only', from: 0, to: 1 }], ground)
    expect(stats.failed).toEqual([])
  })

  it('停太久会失败', () => {
    const held = blot(solid(48, 24, [232, 232, 232], 0), 4, 2, 30, 18)
    const frames = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => ({ ...held, t, rgba: new Uint8Array(held.rgba) }))
    const stats = auditFrames(frames, [{ name: 'only', from: 0, to: 4 }], ground)
    expect(stats.failed.join('\n')).toMatch(/静止/)
  })
})
