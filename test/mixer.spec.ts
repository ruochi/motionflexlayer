import { describe, expect, it } from 'vitest'
import { analyzeAudio } from '../src/audio/analyze.js'
import { dbToGain, mixAudio, sfx } from '../src/audio/mixer.js'
import type { AudioSource } from '../src/audio/types.js'
import { encodeWav } from '../src/audio/wav.js'
import { timeline } from '../src/timeline.js'

const SR = 1000

/** 恒定直流音源，长度 seconds 秒，便于直接读采样值。 */
const dc = (value: number, seconds: number): AudioSource => ({
  name: `dc${value}`,
  render: ({ sampleRate }) => {
    const n = Math.round(seconds * sampleRate)
    return { l: new Float32Array(n).fill(value), r: new Float32Array(n).fill(value) }
  },
})

const at = (s: { l: Float32Array }, t: number) => s.l[Math.round(t * SR)]!

describe('mixAudio', () => {
  it('片段放在 at 处，增益按 dB', async () => {
    const mix = await mixAudio(
      { sampleRate: SR, clips: [{ src: dc(0.5, 0.2), at: 1, gain: -6 }], master: { limit: false } },
      { duration: 2 },
    )
    expect(at(mix, 0.9)).toBe(0)
    expect(at(mix, 1.1)).toBeCloseTo(0.5 * dbToGain(-6), 5)
    expect(at(mix, 1.3)).toBe(0)
  })

  it('loop 铺满到合成结束', async () => {
    const mix = await mixAudio({ sampleRate: SR, clips: [{ src: dc(0.25, 0.1), loop: true }], master: { limit: false } }, { duration: 1 })
    expect(at(mix, 0.95)).toBeCloseTo(0.25, 5)
  })

  it('负的 at 从音源中间开始', async () => {
    const ramp: AudioSource = {
      render: () => {
        const l = Float32Array.from({ length: 1000 }, (_, i) => i / 1000)
        return { l, r: l.slice() }
      },
    }
    const mix = await mixAudio({ sampleRate: SR, clips: [{ src: ramp, at: -0.5 }], master: { limit: false } }, { duration: 0.4 })
    expect(at(mix, 0)).toBeCloseTo(0.5, 3)
  })

  it('声像：等功率，居中时左右相等', async () => {
    const mix = await mixAudio({ sampleRate: SR, clips: [{ src: dc(0.5, 1), pan: 1 }], master: { limit: false } }, { duration: 1 })
    expect(Math.abs(mix.l[100]!)).toBeLessThan(1e-6)
    expect(mix.r[100]).toBeCloseTo(0.5 * Math.SQRT2, 5)
  })

  it('按时间闪避：命中时压下 depth，之后恢复', async () => {
    const mix = await mixAudio(
      {
        sampleRate: SR,
        clips: [{ src: dc(0.5, 4), bus: 'music' }],
        buses: { music: { duck: { times: [1], depth: 0.6, attack: 0.001, release: 0.1 } } },
        master: { limit: false },
      },
      { duration: 4 },
    )
    expect(at(mix, 0.5)).toBeCloseTo(0.5, 5)
    expect(at(mix, 1.002)).toBeCloseTo(0.5 * 0.4, 2)
    expect(at(mix, 2)).toBeCloseTo(0.5, 3)
  })

  it('按母线闪避：另一条母线响时压低', async () => {
    const mix = await mixAudio(
      {
        sampleRate: SR,
        clips: [
          { src: dc(0.2, 4), bus: 'music' },
          { src: dc(0.5, 1), at: 2, bus: 'voice' },
        ],
        buses: { music: { duck: { by: 'voice', depth: 0.5, attack: 0.005, release: 0.05, threshold: -30 } }, voice: { gain: -120 } },
        master: { limit: false },
      },
      { duration: 4 },
    )
    expect(at(mix, 1)).toBeCloseTo(0.2, 4)
    expect(at(mix, 2.5)).toBeCloseTo(0.1, 2)
  })

  it('软限幅不超过天花板，并统计比例', async () => {
    const mix = await mixAudio({ sampleRate: SR, clips: [{ src: dc(3, 1) }], master: { limit: -1 } }, { duration: 1 })
    expect(Math.max(...mix.l)).toBeLessThanOrEqual(dbToGain(-1))
    expect(mix.limited).toBe(1)
  })

  it('normalize 把峰值拉到目标', async () => {
    const mix = await mixAudio({ sampleRate: SR, clips: [{ src: dc(0.1, 1) }], master: { normalize: -6, limit: false } }, { duration: 1 })
    expect(Math.max(...mix.l)).toBeCloseTo(dbToGain(-6), 5)
  })

  it('sfx 把同一音源放到一组时间点', () => {
    const clips = sfx('x.wav', [1, 2], { gain: -3 })
    expect(clips).toEqual([{ src: 'x.wav', at: 1, gain: -3 }, { src: 'x.wav', at: 2, gain: -3 }])
  })
})

describe('报告与 WAV', () => {
  it('cue 跳变：有声音进来时为正', async () => {
    const tl = timeline({ duration: 2 }).cue('hit', 1).cue('silent', 0.5)
    const mix = await mixAudio({ sampleRate: SR, clips: [{ src: dc(0.5, 0.5), at: 1 }], master: { limit: false } }, { duration: 2 })
    const r = analyzeAudio(mix, SR, tl)
    expect(r.cues.find((c) => c.name === 'hit')!.jump).toBeGreaterThan(20)
    expect(r.cues.find((c) => c.name === 'silent')!.jump).toBe(0)
  })

  it('WAV 头和长度正确', () => {
    const wav = encodeWav({ l: new Float32Array(10), r: new Float32Array(10) }, 48000)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(48000)
    expect(wav.length).toBe(44 + 10 * 4)
  })
})
