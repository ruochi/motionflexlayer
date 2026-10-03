import { fork } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadComposition } from '../composition.js'
import { renderAudio } from '../audio/mixer.js'
import { runFfmpeg } from './ffmpeg.js'
import { IssueLog } from './issues.js'
import type { WorkerJob, WorkerMessage } from './worker.js'

export type VideoOptions = {
  /** 合成入口文件。worker 进程按路径重新加载它，所以必须是文件而不是对象。 */
  entry: string
  exportName?: string
  /** 输出 mp4。 */
  out: string
  /** 进程数。默认 CPU 核数 - 1。 */
  workers?: number
  /** 覆盖合成的 fps，出草稿时用 30。 */
  fps?: number
  /** 像素倍率。0.5 出半分辨率草稿。 */
  scale?: number
  /** x264 质量，越小越好。默认 16。 */
  crf?: number
  preset?: string
  /** 只渲染 [from, to) 秒。 */
  from?: number
  to?: number
  /** 混音并合成到视频里。默认 true（合成定义了 audio 时）。 */
  audio?: boolean
  onProgress?: (done: number, total: number, elapsed: number) => void
}

export type VideoResult = {
  out: string
  frames: number
  seconds: number
  issues: IssueLog
  audio?: string
}

const workerUrl = new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url)

/**
 * 多进程渲染视频：帧区间平均切给 N 个进程，各自把 PNG 流进 ffmpeg 编成一段，最后无损拼接、混入音轨。
 * 内存只占一帧，几分钟的片子也不会爆。
 */
export async function renderVideo(opts: VideoOptions): Promise<VideoResult> {
  const entry = resolve(opts.entry)
  const exportName = opts.exportName ?? 'default'
  const comp = await loadComposition(entry, exportName)
  const fps = opts.fps ?? comp.fps
  const first = Math.max(0, Math.round((opts.from ?? 0) * fps))
  const last = Math.min(Math.round(comp.duration * fps), Math.round((opts.to ?? comp.duration) * fps))
  const total = last - first
  if (total <= 0) throw new Error('渲染区间为空')

  const out = resolve(opts.out)
  const { dir, name } = parse(out)
  const segDir = join(dir, `.${name}-segments`)
  await rm(segDir, { recursive: true, force: true })
  await mkdir(segDir, { recursive: true })

  const workers = Math.max(1, Math.min(opts.workers ?? availableParallelism() - 1, Math.ceil(total / 30)))
  const per = Math.ceil(total / workers)
  const started = performance.now()
  const issues = new IssueLog(comp.lint)
  let done = 0

  const wantAudio = (opts.audio ?? true) && comp.audio != null
  const audioFile = wantAudio ? join(dir, `${name}.wav`) : undefined
  const audioJob = audioFile ? renderAudio(comp, audioFile, { from: first / fps, to: last / fps }) : undefined

  const segments: string[] = []
  const jobs: Promise<void>[] = []
  for (let w = 0; w < workers; w++) {
    const from = first + w * per
    const to = Math.min(last, from + per)
    if (from >= to) break
    const seg = join(segDir, `seg${String(w).padStart(3, '0')}.mp4`)
    segments.push(seg)
    const job: WorkerJob = {
      entry,
      exportName,
      from,
      to,
      fps,
      scale: opts.scale ?? 1,
      crf: opts.crf ?? 16,
      preset: opts.preset ?? 'medium',
      out: seg,
    }
    jobs.push(
      new Promise<void>((res, rej) => {
        const child = fork(fileURLToPath(workerUrl), [], { execArgv: process.execArgv, stdio: 'inherit' })
        let failed = false
        child.on('message', (m: WorkerMessage) => {
          if (m.type === 'progress') {
            done += m.frames
            opts.onProgress?.(done, total, (performance.now() - started) / 1000)
          } else if (m.type === 'done') issues.merge(m.issues, m.frames)
          else if (m.type === 'error') {
            failed = true
            rej(new Error(`第 ${from}–${to} 帧渲染失败：\n${m.message}`))
          }
        })
        child.on('error', rej)
        child.on('exit', (code) => {
          if (failed) return
          if (code === 0) res()
          else rej(new Error(`worker 退出码 ${code}`))
        })
        child.send(job)
      }),
    )
  }
  await Promise.all([...jobs, audioJob])

  await mkdir(dirname(out), { recursive: true })
  const list = join(segDir, 'list.txt')
  await writeFile(list, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'))
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list]
  if (audioFile) args.push('-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest')
  args.push('-c:v', 'copy', '-movflags', '+faststart', out)
  await runFfmpeg(args)
  await rm(segDir, { recursive: true, force: true })
  return { out, frames: total, seconds: (performance.now() - started) / 1000, issues, audio: audioFile }
}
