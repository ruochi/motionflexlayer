import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeWav } from '../src/audio/wav.js'
import { defineComposition, frameAt } from '../src/composition.js'
import { alignWords, narration, subtitleChars, toVtt } from '../src/voice/narration.js'
import type { TtsEngine } from '../src/voice/tts.js'

/** 假引擎：每个非标点字念 0.2 秒，写一段静音 WAV。 */
function fakeEngine(): TtsEngine & { calls: number } {
  const engine = {
    name: 'fake',
    ext: 'wav',
    calls: 0,
    async synthesize(req: { text: string }, out: string) {
      engine.calls++
      const chars = [...req.text].filter((c) => !/[，。、]/.test(c))
      const n = Math.round(chars.length * 0.2 * 48000)
      writeFileSync(out, encodeWav({ l: new Float32Array(n), r: new Float32Array(n) }, 48000))
      return chars.map((c, i) => ({ text: c, from: i * 0.2, to: (i + 1) * 0.2 }))
    },
  }
  return engine
}

describe('alignWords', () => {
  it('把词对回原文，标点并进前一个词', () => {
    const words = alignWords('你好，世界。', [
      { text: '你好', from: 0, to: 0.4 },
      { text: '世界', from: 0.5, to: 0.9 },
    ], 10)
    expect(words.map((w) => [w.start, w.end, w.from])).toEqual([
      [0, 3, 10],
      [3, 6, 10.5],
    ])
  })
})

describe('narration', () => {
  it('按念出来的长度排段落，段落首尾相接，缓存命中不再合成', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mfl-vo-'))
    const engine = fakeEngine()
    const lines = [
      { id: 'a', text: '一二三。' },
      { id: 'b', text: '四五', minDuration: 2 },
    ]
    const vo = await narration(lines, { baseDir: dir, engine, lead: 0.5, gap: 0.3, hold: 0.2, tail: 1 })
    const [a, b] = vo.lines
    expect(a!.speechFrom).toBe(0.5)
    expect(a!.speechTo).toBeCloseTo(1.1, 3)
    expect(a!.to).toBeCloseTo(1.3, 3)
    expect(b!.from).toBe(a!.to)
    expect(b!.speechFrom).toBeCloseTo(1.6, 3)
    expect(b!.to - b!.from).toBeCloseTo(2, 3)
    expect(vo.duration).toBe(b!.to)
    expect(engine.calls).toBe(2)

    await narration(lines, { baseDir: dir, engine })
    expect(engine.calls).toBe(2)
  })

  it('字幕是逐字时间，不带样式；片段和时间轴照旧', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mfl-vo-'))
    const vo = await narration([{ id: 'a', text: '一二三。' }], { baseDir: dir, engine: fakeEngine(), lead: 0.5 })
    const chars = vo.subtitles.lines[0]!.chars
    expect(chars.map((c) => [c.text, c.from, c.to])).toEqual([
      ['一', 0.5, 0.7],
      ['二', 0.7, 0.9],
      ['三', 0.9, 1.1],
      ['。', 1.1, 1.1],
    ])
    expect(Object.keys(chars[0]!).sort()).toEqual(['end', 'from', 'index', 'start', 'text', 'to', 'word'])
    const now = vo.subtitle(0.75)!
    expect(now.chars.map((c) => c.progress)).toEqual([1, expect.closeTo(0.25), 0, 0])
    expect(vo.subtitle(5)!.chars.every((c) => c.progress === 1)).toBe(true)
    const vtt = toVtt(vo.subtitles)
    expect(vtt.startsWith('WEBVTT\n')).toBe(true)
    expect(vtt).not.toMatch(/STYLE|color:|font/)
    expect(vtt).toContain('一二三。')
    expect(vo.clips()[0]).toMatchObject({ at: 0.5, bus: 'voice' })
    const tl = vo.timeline()
    expect(tl.sectionNamed('a').from).toBe(0)
    expect(tl.times('word')).toEqual([0.5, 0.7, 0.9])
    expect(tl.duration).toBe(vo.duration)
    const comp = defineComposition({ width: 100, height: 100, duration: vo.duration, subtitles: vo.subtitles, render: () => null })
    expect(frameAt(comp, 0.75).subtitle!.chars[1]!.progress).toBeCloseTo(0.25)
    expect(frameAt(comp, 0.75).subtitle!.chars[1]).not.toHaveProperty('color')
  })

  it('引号算在相邻的词上：前引号跟后一个词开始，后引号跟前一个词结束', () => {
    const words = alignWords('“这里”。', [
      { text: '这里', from: 0.2, to: 0.6 },
    ], 0)
    const chars = subtitleChars('“这里”。', words)
    expect(chars.map((c) => [c.text, c.from, c.to, c.word])).toEqual([
      ['“', 0.2, 0.2, undefined],
      ['这', 0.2, 0.4, 0],
      ['里', 0.4, 0.6, 0],
      ['”', 0.6, 0.6, 0],
      ['。', 0.6, 0.6, 0],
    ])
  })

  it('offline 时缓存缺失直接报错', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mfl-vo-'))
    await expect(narration([{ id: 'a', text: '没有缓存' }], { baseDir: dir, engine: fakeEngine(), offline: true })).rejects.toThrow(/缓存/)
  })
})
