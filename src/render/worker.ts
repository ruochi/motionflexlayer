import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { Envelopes } from '../audio/envelopes.js'
import { loadComposition, setEnvelopes, type Composition } from '../composition.js'
import { ffmpegPath } from './ffmpeg.js'
import { renderRgba } from './frame.js'
import { IssueLog, type IssueStat } from './issues.js'

export type WorkerJob = {
  entry: string
  exportName: string
  /** 帧号区间 [from, to)。 */
  from: number
  to: number
  fps: number
  scale: number
  crf: number
  preset: string
  out: string
  /** 主进程算好的音轨包络（JSON 文件）。 */
  envelopes?: string
}

export type WorkerMessage =
  | { type: 'progress'; frames: number }
  | { type: 'done'; frames: number; issues: IssueStat[] }
  | { type: 'error'; message: string }

const send = (m: WorkerMessage) => process.send!(m)

function startEncoder(ffmpeg: string, job: WorkerJob, width: number, height: number) {
  const ff = spawn(
    ffmpeg,
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(job.fps), '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', job.preset, '-crf', String(job.crf), '-pix_fmt', 'yuv420p',
      '-threads', '2', job.out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  const done = new Promise<void>((resolve, reject) => {
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 退出码 ${code}`))))
  })
  return { stdin: ff.stdin, done }
}

/** 渲染一段帧，RGBA 直接送进 ffmpeg 编码，不落盘。 */
async function run(job: WorkerJob): Promise<void> {
  const loaded = await loadComposition(job.entry, job.exportName)
  const comp: Composition = { ...loaded, fps: job.fps }
  if (job.envelopes) setEnvelopes(comp, JSON.parse(await readFile(job.envelopes, 'utf8')) as Envelopes)
  const ffmpeg = await ffmpegPath()
  let encoder: ReturnType<typeof startEncoder> | undefined
  const issues = new IssueLog(comp.lint)
  let pending = 0
  for (let f = job.from; f < job.to; f++) {
    const { rgba, width, height, report } = await renderRgba(comp, f, { scale: job.scale })
    issues.add(report, f / job.fps)
    encoder ??= startEncoder(ffmpeg, job, width, height)
    if (!encoder.stdin.write(rgba)) await new Promise((r) => encoder!.stdin.once('drain', r))
    if (++pending >= 4) {
      send({ type: 'progress', frames: pending })
      pending = 0
    }
  }
  if (pending) send({ type: 'progress', frames: pending })
  if (encoder) {
    encoder.stdin.end()
    await encoder.done
  }
  send({ type: 'done', frames: issues.frames, issues: issues.stats })
}

process.once('message', (job: WorkerJob) => {
  run(job)
    .catch((err: unknown) => send({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) }))
    .finally(() => process.disconnect())
})
