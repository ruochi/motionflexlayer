import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeWav } from '../src/audio/wav.js'
import { alignWords, narration } from '../src/voice/narration.js'
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

  it('字幕、片段和时间轴', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mfl-vo-'))
    const vo = await narration([{ id: 'a', text: '一二三。' }], { baseDir: dir, engine: fakeEngine(), lead: 0.5 })
    const c = vo.caption(0.75)!
    expect(c.word!.text).toBe('二')
    expect(c.spoken).toBe(1)
    expect(c.speaking).toBe(true)
    expect(vo.caption(5)!.spoken).toBe(4)
    expect(vo.clips()[0]).toMatchObject({ at: 0.5, bus: 'voice' })
    const tl = vo.timeline()
    expect(tl.sectionNamed('a').from).toBe(0)
    expect(tl.times('word')).toEqual([0.5, 0.7, 0.9])
    expect(tl.duration).toBe(vo.duration)
  })

  it('offline 时缓存缺失直接报错', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mfl-vo-'))
    await expect(narration([{ id: 'a', text: '没有缓存' }], { baseDir: dir, engine: fakeEngine(), offline: true })).rejects.toThrow(/缓存/)
  })
})
