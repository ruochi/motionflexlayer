import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
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
 * 报告里带 visualtone 的检查：出调、音区越界、力度呆板、音效太挤、人声被盖住、限幅太深。
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
    timeline: comp.tl,
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

  const report = analyzeAudio(mix, sr, comp.tl, { lufs: mix.lufs, limiterDb: mix.limiterDb, issues: mix.issues })

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
