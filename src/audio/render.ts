import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { analyze, expandSfx, ScoreSchema } from 'visualtone'
import { prepare, type Composition } from '../composition.js'
import { analyzeAudio, drawWaveform, type AudioReport } from './analyze.js'
import type { Envelopes } from './envelopes.js'
import { audioSpecOf, mixAudio } from './mixer.js'
import type { Stereo } from './types.js'
import { encodeWav } from './wav.js'

export type RenderAudioResult = {
  file: string
  report: AudioReport
  /** 交给 visualtone 的乐谱，片段的 src 是键名而不是文件。 */
  scoreFile: string
  envelopes?: Envelopes
  waveform?: string
}

/**
 * 合成的音轨混成 WAV，同时写一份文字报告、乐谱和波形图，供看不到、听不到声音的一方检查。
 * 有旁白（role 为 voice 的母线）时按 voiceover-bed 档案分析：旁白在 1–4 kHz 要高出音乐，音效不能太密。
 */
export async function renderAudio(
  comp: Composition,
  outFile: string,
  opts: { from?: number; to?: number; waveform?: boolean; envelopes?: boolean } = {},
): Promise<RenderAudioResult> {
  // 编曲可能依赖 setup 里的预计算（例如粒子闪光的时刻）
  await prepare(comp, { envelopes: false })
  const spec = await audioSpecOf(comp)
  if (!spec) throw new Error('合成没有定义 audio')
  const mix = await mixAudio(spec, {
    duration: comp.duration,
    baseDir: comp.baseDir,
    stems: true,
    envelopeFps: opts.envelopes ? comp.fps : undefined,
  })
  const sr = mix.sampleRate
  const a = Math.round((opts.from ?? 0) * sr)
  const b = Math.round((opts.to ?? comp.duration) * sr)
  // 帧数按 round(时长 × fps) 取整，可能比音频长几毫秒；补静音，免得封装时 -shortest 截掉末尾几帧
  const cut: Stereo = { l: new Float32Array(Math.max(0, b - a)), r: new Float32Array(Math.max(0, b - a)) }
  cut.l.set(mix.l.subarray(a, Math.min(b, mix.l.length)))
  cut.r.set(mix.r.subarray(a, Math.min(b, mix.r.length)))
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, encodeWav(cut, sr))

  const hasVoice = mix.score.tracks.some((t) => t.role === 'voice')
  // 分轨的 id 是展开后的（fx:whoosh-1……），分析要用展开后的乐谱才对得上 role
  const analysis = analyze({
    buffers: [mix.l, mix.r],
    sampleRate: sr,
    stems: mix.stems,
    score: expandSfx(ScoreSchema.parse(mix.score)),
    profile: hasVoice ? 'voiceover-bed' : undefined,
  }).report
  const report = analyzeAudio(mix, sr, comp.tl, { lufs: mix.lufs, limiterDb: mix.limiterDb, analysis })

  const { dir, name } = parse(outFile)
  const scoreFile = join(dir, `${name}.score.json`)
  await writeFile(scoreFile, JSON.stringify({ ...mix.score, inputs: mix.inputs }, null, 1))
  let waveform: string | undefined
  if (opts.waveform) {
    waveform = join(dir, `${name}.waveform.png`)
    await writeFile(waveform, drawWaveform(mix, sr, comp.tl))
  }
  return { file: outFile, report, scoreFile, envelopes: mix.envelopes, waveform }
}
