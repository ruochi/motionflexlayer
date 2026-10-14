import { describe, expect, it } from 'vitest'
import { analyzeAudio } from '../src/audio/analyze.js'
import { AudioFrame } from '../src/audio/envelopes.js'
import { compileAudio, dbToGain, mixAudio, sfx, timedDuckGain } from '../src/audio/mixer.js'
import type { AudioSource } from '../src/audio/types.js'
import { encodeWav } from '../src/audio/wav.js'
import { timeline } from '../src/timeline.js'

const SR = 48000

/** 正弦音源，长度 seconds 秒。 */
const tone = (hz: number, amp: number, seconds: number, name = `tone${hz}`): AudioSource => ({
  name,
  render: ({ sampleRate }) => {
    const n = Math.round(seconds * sampleRate)
    const l = Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sampleRate))
    return { l, r: l.slice() }
  },
})

const mean = (xs: number[], a: number, b: number) => xs.slice(a, b).reduce((s, v) => s + v, 0) / (b - a)

describe('compileAudio', () => {
  it('每条母线一条音轨，母线增益写在音轨上，片段增益仍是 dB', async () => {
    const { score, clips } = await compileAudio(
      { clips: [{ src: tone(440, 0.5, 1), at: 1, gain: -6, bus: 'music' }], buses: { music: { gain: -3 } } },
      { duration: 3 },
    )
    const t = score.tracks[0]!
    expect(t).toMatchObject({ id: 'music', role: 'music', gain: -3 })
    expect(t.clips![0]).toMatchObject({ at: 1, gain: -6 })
    expect(clips[t.clips![0]!.src]!.channels[0]!.length).toBe(SR)
  })

  it('按名字猜角色，猜不出来的是 sfx', async () => {
    const { score } = await compileAudio(
      { clips: [{ src: tone(1, 0, 0.1), bus: 'vo' }, { src: tone(2, 0, 0.1), bus: 'bgm' }, { src: tone(3, 0, 0.1) }] },
      { duration: 1 },
    )
    expect(score.tracks.map((t) => [t.id, t.role])).toEqual([['vo', 'voice'], ['bgm', 'music'], ['main', 'sfx']])
  })

  it('负的 at 折算成 offset', async () => {
    const { score } = await compileAudio({ clips: [{ src: tone(440, 0.5, 2), at: -0.5 }] }, { duration: 1 })
    expect(score.tracks[0]!.clips![0]).toMatchObject({ at: 0, offset: 0.5 })
  })

  it('loop 缺省铺到合成结束', async () => {
    const { score } = await compileAudio({ clips: [{ src: tone(440, 0.5, 0.1), loop: true, at: 1 }] }, { duration: 3 })
    expect(score.tracks[0]!.clips![0]).toMatchObject({ at: 1, loop: true, duration: 2 })
  })

  it('跟电平的闪避交给 visualtone，按时间点的闪避留给 processTrack', async () => {
    const { score, timedDucks } = await compileAudio(
      {
        clips: [
          { src: tone(220, 0.2, 4), bus: 'music' },
          { src: tone(880, 0.5, 1), at: 2, bus: 'drums' },
        ],
        buses: { music: { duck: [{ by: 'drums', depth: 0.4, release: 0.1 }, { times: [1, 3], depth: 0.3 }] } },
      },
      { duration: 4 },
    )
    expect(score.tracks.find((t) => t.id === 'music')!.duck).toEqual({ by: 'drums', amount: 0.4, release: 0.1 })
    expect(timedDucks.music).toEqual([{ times: [1, 3], depth: 0.3 }])
  })

  it('duck.by 指向不存在的母线时报错', async () => {
    await expect(
      compileAudio({ clips: [{ src: tone(220, 0.2, 1), bus: 'music' }], buses: { music: { duck: { by: 'nobody' } } } }, { duration: 1 }),
    ).rejects.toThrow(/nobody/)
  })

  it('速度和段落缺省取自时间轴，不合格的段落名换成 s0', async () => {
    const tl = timeline({ bpm: 96, duration: 8 }).section('intro', 0).section('高潮', 4)
    const { score } = await compileAudio(
      { tracks: [{ id: 'drums', instrument: 'drums', patterns: [{ in: ['intro'], steps: { kick: 'x...' } }] }] },
      { duration: 8, timeline: tl },
    )
    expect(score.tempo).toEqual({ bpm: 96, meter: '4/4' })
    expect(score.sections).toEqual([{ id: 'intro', at: 0 }, { id: 's1', at: 4 }])
  })

  it('乐谱写错时带着 visualtone 的提示报错', async () => {
    await expect(compileAudio({ tracks: [{ id: 'k', instrument: 'keys', notes: [{ at: 0, pitch: 'C4' }] }] }, { duration: 1 })).rejects.toThrow(
      /epiano/,
    )
  })
})

describe('timedDuckGain', () => {
  it('命中时压到 1 - depth，之后恢复到 1', () => {
    const g = timedDuckGain([{ times: [1], depth: 0.6, attack: 0.01, release: 0.1 }], 4 * SR, SR)
    expect(g[Math.round(0.5 * SR)]).toBe(1)
    expect(g[Math.round(1.01 * SR)]).toBeCloseTo(0.4, 2)
    expect(g[Math.round(2.5 * SR)]).toBeCloseTo(1, 3)
  })
})

describe('mixAudio', () => {
  it('响度对齐到 master.lufs，限幅不超过天花板', async () => {
    const mix = await mixAudio({ clips: [{ src: tone(440, 0.3, 3) }], master: { lufs: -18, ceiling: -1 } }, { duration: 3 })
    expect(mix.lufs).toBeCloseTo(-18, 0)
    expect(mix.l.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(dbToGain(-1) + 1e-4)
  })

  it('旁白进来时音乐自动让路', async () => {
    const mix = await mixAudio(
      {
        clips: [
          { src: tone(2000, 0.2, 6), bus: 'music' },
          { src: tone(300, 0.3, 2), at: 3, bus: 'voice' },
        ],
      },
      { duration: 6, envelopeFps: 30 },
    )
    const music = mix.envelopes!.tracks.music!.level
    expect(mean(music, 105, 135) / mean(music, 30, 60)).toBeLessThan(0.7)
  })

  it('按时间点闪避压低母线', async () => {
    const spec = (times: number[]) => ({
      clips: [{ src: tone(220, 0.3, 4), bus: 'music' }, { src: tone(1000, 0.05, 4), bus: 'bed' }],
      buses: { music: { duck: times.length ? { times, depth: 0.8, release: 0.3 } : 'off' } },
    })
    // 响度对齐会把整体抬回来，按不闪避的 bed 归一后再比
    const rel = async (times: number[], a: number, b: number) => {
      const t = (await mixAudio(spec(times), { duration: 4, envelopeFps: 30 })).envelopes!.tracks
      return mean(t.music!.level, a, b) / mean(t.bed!.level, a, b)
    }
    expect((await rel([2], 61, 65)) / (await rel([], 61, 65))).toBeLessThan(0.6)
    expect((await rel([2], 105, 115)) / (await rel([], 105, 115))).toBeGreaterThan(0.95)
  })

  it('同样的输入得到同样的输出', async () => {
    const spec = { clips: [{ src: tone(440, 0.3, 1) }], tracks: [{ id: 'fx', role: 'sfx' as const, sfx: [{ type: 'pop' as const, at: 0.2 }] }] }
    const a = await mixAudio(spec, { duration: 1 })
    const b = await mixAudio(spec, { duration: 1 })
    expect(Buffer.from(a.l.buffer).equals(Buffer.from(b.l.buffer))).toBe(true)
  })

  it('包络：起音时刻和电平，画面按 t 查', async () => {
    const mix = await mixAudio(
      {
        clips: [{ src: tone(440, 0.3, 0.5), at: 1, bus: 'hit' }],
        tracks: [{ id: 'fx', role: 'sfx', sfx: [{ type: 'impact', at: [0.5, 1.5] }] }],
      },
      { duration: 2, envelopeFps: 30 },
    )
    const env = mix.envelopes!
    expect(env.tracks.hit!.onsets).toEqual([1])
    expect(env.tracks.fx!.onsets).toEqual([0.5, 1.5])
    expect(new AudioFrame(env, 0.5).level('hit')).toBe(0)
    expect(new AudioFrame(env, 1.2).level('hit')).toBeGreaterThan(0.05)
    expect(new AudioFrame(env, 1.25).since('hit')).toBeCloseTo(0.25, 5)
    expect(new AudioFrame(env, 0.5).since('hit')).toBe(Infinity)
    expect(env.master.level.length).toBe(60)
  })

  it('visualtone 的检查进报告', async () => {
    const mix = await mixAudio(
      { key: 'C major', tracks: [{ id: 'lead', instrument: 'lead', notes: [{ at: 0, pitch: 'F#4' }, { at: 0.5, pitch: 'C4' }] }] },
      { duration: 1 },
    )
    expect(mix.issues.map((i) => i.code)).toContain('out-of-key')
  })

  it('sfx 把同一音源放到一组时间点', () => {
    const clips = sfx('x.wav', [1, 2], { gain: -3 })
    expect(clips).toEqual([{ src: 'x.wav', at: 1, gain: -3 }, { src: 'x.wav', at: 2, gain: -3 }])
  })
})

describe('报告与 WAV', () => {
  it('cue 跳变：有声音进来时为正', async () => {
    const tl = timeline({ duration: 2 }).cue('hit', 1).cue('silent', 0.5)
    const mix = await mixAudio({ clips: [{ src: tone(440, 0.5, 0.5), at: 1 }] }, { duration: 2 })
    const r = analyzeAudio(mix, SR, tl, { lufs: mix.lufs, limiterDb: mix.limiterDb })
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
