import { describe, expect, it } from 'vitest'
import { analyzeAudio } from '../src/audio/analyze.js'
import { AudioFrame } from '../src/audio/envelopes.js'
import { compileAudio, dbToGain, duckKeyframes, mixAudio, sfx } from '../src/audio/mixer.js'
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

const rms = (s: { l: Float32Array }, from: number, to: number) => {
  let sum = 0
  const a = Math.round(from * SR)
  const b = Math.round(to * SR)
  for (let i = a; i < b; i++) sum += s.l[i]! ** 2
  return Math.sqrt(sum / (b - a))
}

describe('compileAudio', () => {
  it('每条母线一条立体声音轨，增益 dB 换成线性', async () => {
    const { score } = await compileAudio(
      { clips: [{ src: tone(440, 0.5, 1), at: 1, gain: -6, bus: 'music' }], buses: { music: { gain: -6 } } },
      { duration: 3 },
    )
    const t = score.tracks[0]!
    expect(t.id).toBe('music')
    expect(t.role).toBe('music')
    expect(t.channel).toEqual([0, 1])
    expect(t.clips![0]!.at).toBe(1)
    expect(t.clips![0]!.gain).toBeCloseTo(dbToGain(-12), 5)
  })

  it('负的 at 折算成 trim', async () => {
    const { score } = await compileAudio({ clips: [{ src: tone(440, 0.5, 2), at: -0.5 }] }, { duration: 1 })
    expect(score.tracks[0]!.clips![0]).toMatchObject({ at: 0, trim: [0.5, 2] })
  })

  it('loop 预先铺成一段缓冲', async () => {
    const { score, clips } = await compileAudio({ clips: [{ src: tone(440, 0.5, 0.1), loop: true, at: 1 }] }, { duration: 3 })
    const c = score.tracks[0]!.clips![0]!
    expect(clips[c.src]!.buffers[0]!.length).toBe(2 * SR)
  })

  it('按电平闪避交给 visualtone，按时间闪避变成 automation', async () => {
    const { score } = await compileAudio(
      {
        clips: [
          { src: tone(220, 0.2, 4), bus: 'music' },
          { src: tone(880, 0.5, 1), at: 2, bus: 'voice' },
        ],
        buses: {
          music: { duck: [{ by: 'voice', depth: 0.5, band: [1000, 4000] }, { times: [1, 3], depth: 0.3 }] },
        },
      },
      { duration: 4 },
    )
    const music = score.tracks.find((t) => t.id === 'music')!
    expect(music.duck).toMatchObject({ by: 'voice', amount: 0.5, band: [1000, 4000] })
    expect(music.automation!.gain!.length).toBeGreaterThan(4)
    expect(score.tracks.find((t) => t.id === 'voice')!.role).toBe('voice')
  })

  it('duck.by 指向不存在的母线时报错', async () => {
    await expect(
      compileAudio({ clips: [{ src: tone(220, 0.2, 1), bus: 'music' }], buses: { music: { duck: { by: 'nobody' } } } }, { duration: 1 }),
    ).rejects.toThrow(/nobody/)
  })

  it('tracks 原样带上，默认立体声', async () => {
    const { score } = await compileAudio({ tracks: [{ id: 'fx', role: 'sfx', sfx: [{ sfx: 'whoosh', t: 0.5 }] }] }, { duration: 2 })
    expect(score.tracks[0]).toMatchObject({ id: 'fx', channel: [0, 1] })
  })
})

describe('duckKeyframes', () => {
  it('命中时压到 1 - depth，之后恢复到 1', () => {
    const keys = duckKeyframes({ times: [1], depth: 0.6, attack: 0.01, release: 0.1 }, 4)
    const at = (t: number) => keys.reduce((v, k) => (k.t <= t ? k.v : v), 1)
    expect(at(0.5)).toBe(1)
    expect(at(1.011)).toBeCloseTo(0.4, 2)
    expect(keys[keys.length - 1]!.v).toBe(1)
    for (let i = 1; i < keys.length; i++) expect(keys[i]!.t).toBeGreaterThan(keys[i - 1]!.t)
  })
})

describe('mixAudio', () => {
  it('响度对齐到 master.lufs，限幅不超过天花板', async () => {
    const mix = await mixAudio({ clips: [{ src: tone(440, 0.3, 3) }], master: { lufs: -18, ceiling: -1 } }, { duration: 3 })
    expect(mix.lufs).toBeCloseTo(-18, 0)
    expect(mix.l.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(dbToGain(-1) + 1e-4)
  })

  it('旁白进来时音乐被压低', async () => {
    const spec = {
      clips: [
        { src: tone(2000, 0.2, 6), bus: 'music' },
        { src: tone(300, 0.3, 2), at: 3, bus: 'voice' },
      ],
      buses: { music: { duck: { by: 'voice', depth: 0.6, hold: 0, release: 0.05 } } },
      master: { lufs: -16 },
    }
    const mix = await mixAudio(spec, { duration: 6, stems: true })
    const music = mix.stems!.find((s) => s.id === 'music')!
    expect(rms(music, 3.5, 4.5) / rms(music, 1, 2)).toBeLessThan(0.6)
  })

  it('同样的输入得到同样的输出', async () => {
    const spec = { clips: [{ src: tone(440, 0.3, 1) }], tracks: [{ id: 'fx', sfx: [{ sfx: 'pop' as const, t: 0.2 }] }] }
    const a = await mixAudio(spec, { duration: 1 })
    const b = await mixAudio(spec, { duration: 1 })
    expect(Buffer.from(a.l.buffer).equals(Buffer.from(b.l.buffer))).toBe(true)
  })

  it('包络：起音时刻和电平，画面按 t 查', async () => {
    const mix = await mixAudio(
      { clips: [{ src: tone(440, 0.3, 0.5), at: 1, bus: 'hit' }] },
      { duration: 2, envelopeFps: 30 },
    )
    const env = mix.envelopes!
    expect(env.tracks.hit!.onsets).toEqual([1])
    expect(new AudioFrame(env, 0.5).level('hit')).toBe(0)
    expect(new AudioFrame(env, 1.2).level('hit')).toBeGreaterThan(0.05)
    expect(new AudioFrame(env, 1.25).since('hit')).toBeCloseTo(0.25, 5)
    expect(new AudioFrame(env, 0.5).since('hit')).toBe(Infinity)
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
