import { describe, expect, it } from 'vitest'
import { auditFrames, formatFrames, type RgbaSample } from '../src/brand/frames.js'
import { auditPlan, auditStructure, formatPlan } from '../src/brand/plan.js'
import { timeline } from '../src/timeline.js'

const shot = `
## 隐喻
一条红线把按钮卡回去。
## 色板
纸、墨、红。
## 节拍
0.5 秒。
## 段 1 指出
镜头：推近。
转场：交接。
| 时刻 | 元素 | 手法 | 缓动 |
| --- | --- | --- | --- |
| 0.20 | a | 擦除 | out |
| 0.45 | b | 擦除 | out |
| 0.90 | c | 弹出 | back |
| 1.25 | d | 描线 | out |
| 1.45 | e | 打字 | set |
## 段 2 五项
镜头：平移。
转场：横甩。
| 0.10 | a | 弹出 | back |
| 0.20 | b | 长条 | out |
| 0.30 | c | 长条 | out |
| 0.40 | d | 长条 | out |
| 0.50 | e | 长条 | out |
## 段 3 卡回
镜头：推近。
转场：穿入。
| 0.10 | a | 甩入 | in |
| 0.20 | b | 描线 | out |
| 0.30 | c | 计数 | linear |
| 0.40 | d | 砸上 | in |
| 0.50 | e | 网格 | out |
## 段 4 三处
镜头：安定。
转场：收到一点。
| 0.10 | a | 滑入 | out |
| 0.20 | b | 弹出 | back |
| 0.30 | c | 擦除 | out |
| 0.40 | d | 弹出 | back |
| 0.50 | e | 缩放 | out |
## 段 5 落款
镜头：拉远，全片只此一次。
落幅：标记和句子在同一条轴上。
| 0.10 | a | 收到一点 | in |
| 0.20 | b | 弹出 | back |
| 0.30 | c | 擦除 | out |
| 0.40 | d | 描线 | out |
| 0.50 | e | 淡入 | out |
## 分区
| 段 | 标题区 | 产品区 | 标记区 | 故意留白 |
| 1 | 左 | 右 | 无 | 左下 |
| 2 | 左 | 中 | 无 | 右上 |
| 3 | 左 | 中 | 数字 | 右下 |
| 4 | 左 | 三台 | 无 | 间隙 |
| 5 | 中 | 按钮 | 标记 | 两侧 |
## 自检
- [x] 一
- [x] 二
- [x] 三
- [x] 四
- [x] 五
- [x] 六
- [x] 七
- [x] 八
`

const copy = `
| 画面文字 | 出处 |
| --- | --- |
| 甲 | 简介 |
| 乙 | 简介 |
| 丙 | 简介 |
| 丁 | 简介 |
`

const assets = `
标记：logo.svg
来源：本片自绘。
`

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
    expect(auditPlan({ shotList: shot, copy, assets })).toEqual([])
  })

  it('缺文件、待填、段里事件不够，都失败', () => {
    const issues = auditPlan({ shotList: shot.replace('| 0.50 | e | 缩放 | out |', ''), copy: '没有表', assets: '待填' })
    expect(issues.some((i) => i.file === 'shot-list.md' && i.message.includes('段 4'))).toBe(true)
    expect(issues.some((i) => i.file === 'copy.md')).toBe(true)
    expect(issues.some((i) => i.file === 'assets.md' && i.message.includes('待填'))).toBe(true)
    expect(formatPlan(issues)).toMatch(/failed/)
  })

  it('五段都要有足够的 cue', () => {
    const tl = timeline({ bpm: 120, duration: 15 }).section('a', 0).section('b', 3).section('c', 6).section('d', 9).section('e', 12)
    tl.cue('x', [0.2, 0.4, 0.6, 0.8, 1, 3.2, 3.4, 3.6, 3.8, 4, 6.2, 6.4, 6.6, 6.8, 7, 9.2, 9.4, 9.6, 9.8, 10])
    expect(auditStructure({ duration: 15, tl }).map((i) => i.message).join('\n')).toMatch(/e/)
    tl.cue('y', [12.2, 12.4, 12.6, 12.8, 13])
    expect(auditStructure({ duration: 15, tl })).toEqual([])
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
