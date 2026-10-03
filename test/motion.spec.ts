import { describe, expect, it } from 'vitest'
import { fade, keyframes, progress, type Keyframe, pulse, spring, springDuration, springSteps, stagger, wiggle } from '../src/motion.js'
import { timeline } from '../src/timeline.js'

describe('spring', () => {
  it('从 0 出发，停在 1', () => {
    expect(spring(-1)).toBe(0)
    expect(spring(0)).toBe(0)
    expect(spring(5)).toBeCloseTo(1, 4)
  })

  it('欠阻尼会过冲，过阻尼不会', () => {
    const peak = (damping: number) => Math.max(...Array.from({ length: 480 }, (_, i) => spring(i / 240, { damping })))
    expect(peak(8)).toBeGreaterThan(1.05)
    expect(peak(40)).toBeLessThanOrEqual(1)
  })

  it('初速度为正时起步更快', () => {
    expect(spring(0.02, { velocity: 20 })).toBeGreaterThan(spring(0.02))
  })

  it('springDuration 之后偏差小于阈值', () => {
    const d = springDuration({ damping: 14, stiffness: 160 })
    for (let t = d + 0.01; t < d + 1; t += 0.05) expect(Math.abs(spring(t, { damping: 14, stiffness: 160 }) - 1)).toBeLessThan(0.005)
  })
})

describe('时间工具', () => {
  it('progress 夹在 0..1', () => {
    expect(progress(-1, 0, 2)).toBe(0)
    expect(progress(1, 0, 2)).toBe(0.5)
    expect(progress(3, 0, 2)).toBe(1)
  })

  it('fade 窗口内为 1，窗口外为 0', () => {
    expect(fade(0, 1, 3, 0.5)).toBe(0)
    expect(fade(2, 1, 3, 0.5)).toBe(1)
    expect(fade(3.1, 1, 3, 0.5)).toBe(0)
  })

  it('pulse 命中为 1，之后衰减，之前为 0', () => {
    expect(pulse(0.5, [1, 2])).toBe(0)
    expect(pulse(1, [1, 2])).toBe(1)
    expect(pulse(1.2, [1, 2], 8)).toBeCloseTo(Math.exp(-1.6), 6)
    expect(pulse(2, [1, 2])).toBe(1)
  })

  it('springSteps 每个事件加 1', () => {
    expect(springSteps(0, [1, 2, 3])).toBe(0)
    expect(springSteps(1.99, [1, 2, 3])).toBeCloseTo(1, 2)
    expect(springSteps(10, [1, 2, 3])).toBeCloseTo(3, 4)
  })

  it('stagger 从中间扩散', () => {
    const d = Array.from({ length: 5 }, (_, i) => stagger(i, 5, { each: 0.1, from: 'center' }))
    expect(d[2]).toBe(0)
    expect(d[0]).toBeCloseTo(0.2)
    expect(d[4]).toBeCloseTo(0.2)
  })

  it('keyframes 支持数组值', () => {
    const frames: Keyframe<number[]>[] = [{ at: 0, value: [0, 0] }, { at: 1, value: [10, 20] }]
    expect(keyframes(0.5, frames)).toEqual([5, 10])
    expect(keyframes(2, frames)).toEqual([10, 20])
  })

  it('wiggle 确定、有界', () => {
    expect(wiggle(1.234, 3, 10, 7)).toBe(wiggle(1.234, 3, 10, 7))
    for (let t = 0; t < 5; t += 0.01) expect(Math.abs(wiggle(t, 6, 10, 1))).toBeLessThanOrEqual(10)
  })
})

describe('timeline', () => {
  const tl = timeline({ bpm: 120, duration: 16 }).section('intro', 0).section('drop', 8)
  tl.cue('kick', tl.beats(0, 4)).cue('hit', tl.bar(2), { amp: 3 })

  it('节拍换算', () => {
    expect(tl.beatLength).toBe(0.5)
    expect(tl.barLength).toBe(2)
    expect(tl.beat(3)).toBe(1.5)
    expect(tl.bar(2, 1)).toBe(4.5)
    expect(tl.beatAt(1.75)).toBe(3.5)
    expect(tl.snap(1.6)).toBe(1.5)
  })

  it('cue 按名字取时间和数据', () => {
    expect(tl.times('kick')).toEqual([0, 0.5, 1, 1.5])
    expect(tl.at('hit')).toBe(4)
    expect(tl.cues<{ amp: number }>('hit')[0]!.data!.amp).toBe(3)
    expect(() => tl.at('nope')).toThrow()
  })

  it('段落首尾相接，最后一段到 duration', () => {
    expect(tl.sections.map((s) => [s.name, s.from, s.to])).toEqual([['intro', 0, 8], ['drop', 8, 16]])
    const s = tl.sectionAt(10)!
    expect(s.name).toBe('drop')
    expect(s.local).toBe(2)
    expect(s.progress).toBe(0.25)
  })
})
