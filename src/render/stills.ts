import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCanvas, DEFAULT_FONT, loadImage } from '../canvas.js'
import type { Composition } from '../composition.js'
import { renderFrame } from './frame.js'
import { IssueLog } from './issues.js'

export type StillsOptions = {
  outDir: string
  scale?: number
  /** 拼一张联系表。默认 true。 */
  sheet?: boolean
  /** 联系表每行几张。 */
  columns?: number
  /** 联系表单张缩略图宽度。 */
  thumbWidth?: number
}

export type StillsResult = {
  files: string[]
  sheet?: string
  issues: IssueLog
  /** 每帧渲染耗时，毫秒。 */
  timings: number[]
}

const stamp = (t: number) => t.toFixed(2).padStart(6, '0')

/**
 * 渲染若干时刻的静帧，并拼成联系表。看动画最快的办法：
 * 关键时刻（每个 cue 前后）各取一帧，一眼看完构图、层次、是否穿帮。
 */
export async function renderStills(comp: Composition, times: number[], opts: StillsOptions): Promise<StillsResult> {
  await mkdir(opts.outDir, { recursive: true })
  const issues = new IssueLog(comp.lint)
  const files: string[] = []
  const pngs: Buffer[] = []
  const timings: number[] = []
  for (const t of times) {
    const started = performance.now()
    const { png, report } = await renderFrame(comp, t, { scale: opts.scale })
    timings.push(performance.now() - started)
    issues.add(report, t)
    const file = join(opts.outDir, `t${stamp(t)}.png`)
    await writeFile(file, png)
    files.push(file)
    pngs.push(png)
  }
  let sheet: string | undefined
  if ((opts.sheet ?? true) && pngs.length > 1) {
    sheet = join(opts.outDir, 'sheet.png')
    await writeFile(sheet, await contactSheet(pngs, times, opts))
  }
  return { files, sheet, issues, timings }
}

export async function contactSheet(pngs: Buffer[], times: number[], opts: { columns?: number; thumbWidth?: number } = {}): Promise<Buffer> {
  const images = await Promise.all(pngs.map((p) => loadImage(p)))
  const first = images[0]!
  const cols = opts.columns ?? Math.min(4, images.length)
  const tw = opts.thumbWidth ?? 480
  const th = Math.round((tw * first.height) / first.width)
  const gap = 12
  const label = 28
  const rows = Math.ceil(images.length / cols)
  const c = createCanvas(cols * tw + (cols + 1) * gap, rows * (th + label) + (rows + 1) * gap)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#111318'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.font = `500 18px ${DEFAULT_FONT}`
  ctx.textBaseline = 'middle'
  images.forEach((img, i) => {
    const x = gap + (i % cols) * (tw + gap)
    const y = gap + Math.floor(i / cols) * (th + label + gap)
    ;(ctx as unknown as { drawImage(i: unknown, x: number, y: number, w: number, h: number): void }).drawImage(img, x, y + label, tw, th)
    ctx.fillStyle = '#c9ced8'
    ctx.fillText(`${times[i]!.toFixed(2)}s`, x + 2, y + label / 2)
  })
  return c.toBuffer('image/png')
}
