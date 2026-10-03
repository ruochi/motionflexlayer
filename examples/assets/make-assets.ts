/**
 * 生成示例用的音频文件（npm run assets）。真实项目里这些是你从音效库、作曲那里拿到的文件，
 * 这里用示例合成器现做，免得仓库依赖外部素材的版权。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeWav, type Stereo } from 'motionflexlayer'
import { Synth } from '../synth/index.js'

const SR = 48000
const here = dirname(fileURLToPath(import.meta.url))

function normalize(s: Stereo, peakDb = -1): Stereo {
  let peak = 0
  for (let n = 0; n < s.l.length; n++) peak = Math.max(peak, Math.abs(s.l[n]!), Math.abs(s.r[n]!))
  const k = 10 ** (peakDb / 20) / (peak || 1)
  return { l: s.l.map((v) => v * k), r: s.r.map((v) => v * k) }
}

async function make(name: string, duration: number, build: (s: Synth) => void, opts: { reverb?: number; delay?: number } = {}) {
  const s = new Synth({ sampleRate: SR, duration, seed: 7 })
  build(s)
  const out = join(here, name)
  await writeFile(out, encodeWav(normalize(s.mixdown(opts)), SR))
  console.log(out)
}

const CHORDS = [
  { bass: 33, pad: [57, 60, 64, 71] },
  { bass: 29, pad: [53, 57, 60, 64] },
  { bass: 36, pad: [55, 60, 64, 71] },
  { bass: 31, pad: [55, 59, 62, 69] },
]

await mkdir(here, { recursive: true })

await make('kick.wav', 0.6, (s) => s.kick(0, 1), { reverb: 0.2 })
await make('tick.wav', 0.3, (s) => s.tick(0, 1), { reverb: 0.3 })
await make('whoosh.wav', 1.2, (s) => s.whoosh(0, 0.8, 0.5, -0.5, 0.5, 300, 4200))
await make('impact.wav', 3.5, (s) => s.impact(0, 1, 1.1))
await make('chime.wav', 2.5, (s) => {
  s.bell(0, 81, 0.5, -0.2, 1.8, 1)
  s.bell(0.06, 88, 0.3, 0.2, 2.2, 0.8)
})

// 120 BPM、四小节（8 秒）可无缝循环的铺底：pad + 八分音符贝斯 + 闭镲。没有底鼓，底鼓在合成里按 cue 放。
// 多渲染两小节，尾音（混响、release）折回开头，循环点不会断。
await make('bgm-loop.wav', 8, (s) => {
  const BEAT = 0.5
  for (const lap of [-1, 0]) {
    CHORDS.forEach((ch, bar) => {
      const t = lap * 8 + bar * 2
      s.pad(t, 2, ch.pad, 0.16, 2200, 0.25, 0.8)
      for (let k = 0; k < 8; k++) s.bass(t + (k * BEAT) / 2, 0.2, ch.bass + 12 + (k % 4 === 2 ? 12 : 0), 0.26)
      for (let k = 0; k < 4; k++) s.hat(t + k * BEAT + BEAT / 2, 0.08, k % 2 === 1, 0.2)
    })
  }
})
