import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { renderFvg } from '@dc/flexlayer'
import { renderScore } from './audio/score.js'
import { frame, precompute } from './composition.js'
import { DURATION, FLEX_STATES, FPS, INTRO, OUTRO, TITLE } from './timeline.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'out')

const { values } = parseArgs({
  options: {
    stills: { type: 'string' },
    scale: { type: 'string', default: '1' },
    from: { type: 'string', default: '0' },
    to: { type: 'string', default: String(DURATION) },
    'audio-only': { type: 'boolean', default: false },
    out: { type: 'string', default: join(outDir, 'showreel.mp4') },
  },
})

/** Issues the checker is right about but that the choreography wants, limited to the frames where they happen. */
const EXPECTED: Array<{ code: string; from: number; to: number; why: string }> = [
  { code: 'overflow-canvas', from: INTRO.push, to: FLEX_STATES[0]! + 24, why: 'camera push into the square, which returns as a flex item; items drop in from above' },
  { code: 'outside-safe', from: INTRO.push, to: FLEX_STATES[0]!, why: 'camera push' },
  { code: 'overflow-canvas', from: TITLE.hit, to: TITLE.hit + 40, why: 'shockwave ring' },
  { code: 'overflow-canvas', from: OUTRO.out, to: DURATION, why: 'closing ring' },
  { code: 'effect-clipped', from: TITLE.hit, to: TITLE.hit + 40, why: 'shockwave ring' },
  { code: 'min-font-size', from: 0, to: DURATION, why: 'HUD, captions and code labels are small on purpose' },
  { code: 'effect-clipped', from: FLEX_STATES[0]!, to: FLEX_STATES[0]! + 24, why: 'items drop in from above with their shadows' },
  { code: 'text-overlap', from: INTRO.push, to: FLEX_STATES[0]!, why: 'camera push' },
  ...FLEX_STATES.map((at) => ({ code: 'text-overlap', from: at, to: at + 10, why: 'outgoing and incoming CSS labels cross-fade' })),
  { code: 'text-overlap', from: TITLE.hit, to: TITLE.hit + 40, why: 'letters spring in rotated and overshoot' },
  { code: 'text-overlap', from: OUTRO.collapse, to: OUTRO.collapse + 30, why: 'letters collapse into one dot' },
]

const expected = (code: string, f: number) => EXPECTED.some((e) => e.code === code && f >= e.from && f < e.to)

type IssueTally = Map<string, { count: number; first: number; path: string; message: string }>

function tally(issues: IssueTally, f: number, list: Array<{ level: string; code: string; path: string; message: string }>) {
  for (const issue of list) {
    const key = expected(issue.code, f) ? `expected ${issue.code}` : `${issue.level} ${issue.code} ${issue.path}`
    const seen = issues.get(key)
    if (seen) seen.count++
    else issues.set(key, { count: 1, first: f, path: issue.path, message: issue.message })
  }
}

function report(issues: IssueTally) {
  if (issues.size === 0) console.log('report: no issues in any frame')
  for (const [key, info] of issues) console.log(`report: ${key} x${info.count} (first at frame ${info.first}) ${info.message}`)
  return [...issues.keys()].some((k) => k.startsWith('error'))
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const scale = Number(values.scale)

  const wavPath = join(outDir, 'showreel.wav')
  const t0 = performance.now()
  await writeFile(wavPath, renderScore())
  console.log(`audio: ${wavPath} (${Math.round(performance.now() - t0)} ms)`)
  if (values['audio-only']) return

  const data = await precompute()
  const issues: IssueTally = new Map()

  if (values.stills) {
    for (const f of values.stills.split(',').map(Number)) {
      const { png, report: r } = await renderFvg(frame(f, data), { t: f / FPS, scale })
      tally(issues, f, r.issues)
      const path = join(outDir, `still-${String(f).padStart(3, '0')}.png`)
      await writeFile(path, png)
      console.log(path)
    }
    report(issues)
    return
  }

  const from = Number(values.from)
  const to = Math.min(DURATION, Number(values.to))
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0']
  if (from === 0 && to === DURATION) args.push('-i', wavPath, '-c:a', 'aac', '-b:a', '192k')
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', values.out!)
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] })
  const closed = new Promise<void>((resolve, reject) => {
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))))
  })

  const start = performance.now()
  for (let f = from; f < to; f++) {
    const { png, report: r } = await renderFvg(frame(f, data), { t: f / FPS, scale })
    tally(issues, f, r.issues)
    if (!ff.stdin.write(png)) await new Promise((resolve) => ff.stdin.once('drain', resolve))
    if ((f - from) % 30 === 0) {
      const per = (performance.now() - start) / (f - from + 1)
      console.log(`frame ${f}/${to} · ${Math.round(per)} ms/frame`)
    }
  }
  ff.stdin.end()
  await closed
  console.log(values.out)
  if (report(issues)) process.exitCode = 1
}

main()
