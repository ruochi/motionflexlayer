#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { loadComposition, type Composition } from './composition.js'
import { formatAudioReport } from './audio/analyze.js'
import { renderAudio } from './audio/render.js'
import { renderFrame } from './render/frame.js'
import { IssueLog } from './render/issues.js'
import { renderStills } from './render/stills.js'
import { renderVideo } from './render/video.js'

const HELP = `motionflexlayer <命令> <合成入口> [选项]

命令
  stills <entry> [t1 t2 …]   渲染静帧和联系表。不给时间则按 --every 均匀取样
      --every <秒>            取样间隔，默认 时长/12
      --cues                  额外在每个段落开头 +0.4s 取一帧
      --scale <倍率>          默认 0.5
  check <entry>              逐帧排版检查，只汇总问题不出图
      --every <秒>            默认 1/fps × 6
      --scale <倍率>          默认 0.25
  render <entry>             渲染视频（多进程）并混入音轨
      --out <文件>            默认 out/<id>/<id>.mp4
      --workers <n> --fps <n> --scale <倍率> --crf <n> --preset <x264 预设>
      --from <秒> --to <秒>   只渲染一段
      --no-audio
  audio <entry>              只混音：WAV + 波形图 + 电平报告
  cues <entry>               导出时间轴（节拍、段落、cue）JSON，给剪辑软件或作曲用
  voice <entry>              合成或读取旁白缓存，按段列出起止时间、字数和语速

通用
  --export <名字>             合成的导出名，默认 default
  --outdir <目录>             输出目录，默认 out/<id>`

type Args = { _: string[]; flags: Record<string, string | true> }

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next != null && !next.startsWith('--')) {
        out.flags[key] = next
        i++
      } else out.flags[key] = true
    } else out._.push(a)
  }
  return out
}

const num = (v: string | true | undefined, fallback: number) => (typeof v === 'string' ? Number(v) : fallback)

function compId(comp: Composition, entry: string): string {
  if (comp.id) return comp.id
  const base = basename(entry, extname(entry))
  return base === 'index' ? basename(resolve(entry, '..')) : base
}

async function main() {
  const { _: pos, flags } = parseArgs(process.argv.slice(2))
  const [cmd, entry, ...rest] = pos
  if (!cmd || !entry || flags.help) {
    console.log(HELP)
    process.exit(cmd ? 0 : 1)
  }
  const exportName = typeof flags.export === 'string' ? flags.export : 'default'
  const comp = await loadComposition(entry, exportName)
  const id = compId(comp, entry)
  const outDir = resolve(typeof flags.outdir === 'string' ? flags.outdir : join('out', id))

  if (cmd === 'stills') {
    let times = rest.map(Number).filter((v) => Number.isFinite(v))
    if (times.length === 0) {
      const every = num(flags.every, comp.duration / 12)
      for (let t = every / 2; t < comp.duration; t += every) times.push(Math.round(t * 100) / 100)
    }
    if (flags.cues) times.push(...comp.tl.sections.map((s) => Math.round((s.from + 0.4) * 100) / 100))
    times = [...new Set(times)].sort((a, b) => a - b)
    const res = await renderStills(comp, times, { outDir: join(outDir, 'stills'), scale: num(flags.scale, 0.5) })
    for (let i = 0; i < res.files.length; i++) console.log(`${times[i]!.toFixed(2)}s  ${res.timings[i]!.toFixed(0)}ms  ${res.files[i]}`)
    if (res.sheet) console.log(`联系表 ${res.sheet}`)
    console.log(res.issues.format())
    return
  }

  if (cmd === 'check') {
    const every = num(flags.every, 6 / comp.fps)
    const scale = num(flags.scale, 0.25)
    const log = new IssueLog(comp.lint)
    const started = performance.now()
    for (let t = 0; t < comp.duration; t += every) {
      const { report } = await renderFrame(comp, t, { scale })
      log.add(report, t)
    }
    console.log(`检查 ${log.frames} 帧，用时 ${((performance.now() - started) / 1000).toFixed(1)}s`)
    console.log(log.format())
    process.exitCode = log.errorCount > 0 ? 2 : 0
    return
  }

  if (cmd === 'render') {
    const out = resolve(typeof flags.out === 'string' ? flags.out : join(outDir, `${id}.mp4`))
    let lastLog = 0
    const res = await renderVideo({
      entry,
      exportName,
      out,
      workers: typeof flags.workers === 'string' ? Number(flags.workers) : undefined,
      fps: typeof flags.fps === 'string' ? Number(flags.fps) : undefined,
      scale: num(flags.scale, 1),
      crf: typeof flags.crf === 'string' ? Number(flags.crf) : undefined,
      preset: typeof flags.preset === 'string' ? flags.preset : undefined,
      from: typeof flags.from === 'string' ? Number(flags.from) : undefined,
      to: typeof flags.to === 'string' ? Number(flags.to) : undefined,
      audio: !flags['no-audio'],
      onProgress: (done, total, el) => {
        const now = performance.now()
        if (now - lastLog < 4000 && done < total) return
        lastLog = now
        const eta = done > 0 ? (el / done) * (total - done) : 0
        console.log(`${done}/${total} 帧  ${el.toFixed(0)}s  剩余约 ${eta.toFixed(0)}s`)
      },
    })
    console.log(`完成 ${res.frames} 帧，用时 ${res.seconds.toFixed(1)}s`)
    console.log(res.issues.format())
    if (res.audio) console.log(formatAudioReport(res.audio.report))
    console.log(res.out)
    return
  }

  if (cmd === 'audio') {
    const out = resolve(typeof flags.out === 'string' ? flags.out : join(outDir, `${id}.wav`))
    const res = await renderAudio(comp, out, { waveform: true })
    console.log(formatAudioReport(res.report))
    console.log(res.file)
    console.log(`乐谱 ${res.scoreFile}`)
    if (res.waveform) console.log(`波形 ${res.waveform}`)
    return
  }

  if (cmd === 'cues') {
    const out = resolve(typeof flags.out === 'string' ? flags.out : join(outDir, `${id}.timeline.json`))
    await mkdir(resolve(out, '..'), { recursive: true })
    await writeFile(out, JSON.stringify({ fps: comp.fps, ...comp.tl.toJSON() }, null, 2))
    console.log(out)
    return
  }

  if (cmd === 'voice') {
    const lines = comp.tl.sections.filter((s) => typeof s.data?.text === 'string')
    if (lines.length === 0) {
      console.log('这个合成没有登记旁白（narration().apply(tl) 或 narration().timeline()）')
      return
    }
    for (const s of lines) {
      const words = comp.tl.cues('word').filter((c) => c.data?.line === s.name)
      const speech = comp.tl.cues(s.name)[0]
      const last = words.at(-1)
      const spoken = speech && last ? last.t - speech.t : 0
      const chars = String(s.data!.text).replace(/[\s\p{P}]/gu, '').length
      const rate = spoken > 0 ? `${(chars / spoken).toFixed(1)} 字/秒` : ''
      console.log(`${s.from.toFixed(2).padStart(6)}–${s.to.toFixed(2).padEnd(6)} ${s.name.padEnd(10)} ${String(words.length).padStart(3)} 词  ${rate}`)
      console.log(`        ${s.data!.text}`)
    }
    console.log(`总时长 ${comp.duration.toFixed(2)}s`)
    return
  }

  console.error(`未知命令：${cmd}\n\n${HELP}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
