import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runFfmpeg } from '../render/ffmpeg.js'

/** 一个词（中文多为一到两个字）的起止，秒，相对这句音频的开头。 */
export type SpokenWord = { text: string; from: number; to: number }

export type TtsRequest = {
  text: string
  voice: string
  /** 语速，edge-tts 写法："+10%"、"-5%"。 */
  rate?: string
  /** 音高："+2Hz"、"-3Hz"。 */
  pitch?: string
  volume?: string
}

export type TtsResult = {
  /** 音频文件的绝对路径。 */
  file: string
  /** 音频时长，秒。 */
  duration: number
  words: SpokenWord[]
}

/**
 * 语音合成引擎。把 text 念成 out 指向的文件，返回逐词时间。
 * 换引擎（本地模型、真人录音的对齐结果）只要实现这个接口。
 */
export type TtsEngine = {
  name: string
  /** 输出文件扩展名，不带点。 */
  ext: string
  synthesize(req: TtsRequest, out: string): Promise<SpokenWord[]>
}

const EDGE_SCRIPT = `
import asyncio, json, sys
import edge_tts
async def main():
    req = json.loads(sys.argv[1])
    c = edge_tts.Communicate(req["text"], req["voice"], rate=req["rate"], pitch=req["pitch"], volume=req["volume"], boundary="WordBoundary")
    words = []
    with open(req["out"], "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"text": ch["text"], "from": ch["offset"] / 1e7, "to": (ch["offset"] + ch["duration"]) / 1e7})
    print(json.dumps(words, ensure_ascii=False))
asyncio.run(main())
`

/**
 * 微软 Edge 在线语音（edge-tts，Python 包）。免费、不需要密钥，但要联网。
 * 安装：pip install edge-tts。Python 路径用 MFL_PYTHON 覆盖，缺省 python3。
 * 结果按内容缓存在合成目录里，提交进仓库后离线也能重现。
 */
export const edgeTts: TtsEngine = {
  name: 'edge-tts',
  ext: 'mp3',
  synthesize(req, out) {
    const python = process.env.MFL_PYTHON ?? 'python3'
    const arg = JSON.stringify({ text: req.text, voice: req.voice, rate: req.rate ?? '+0%', pitch: req.pitch ?? '+0Hz', volume: req.volume ?? '+0%', out })
    return new Promise((resolve, reject) => {
      const p = spawn(python, ['-c', EDGE_SCRIPT, arg], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      p.stdout.on('data', (d) => (stdout += d))
      p.stderr.on('data', (d) => (stderr += d))
      p.on('error', (err) => reject(new Error(`启动 ${python} 失败：${err.message}。设置 MFL_PYTHON 指向装了 edge-tts 的 Python`)))
      p.on('close', (code) => {
        if (code !== 0) {
          const hint = /No module named 'edge_tts'/.test(stderr) ? '\n先安装：pip install edge-tts' : ''
          reject(new Error(`edge-tts 合成失败（退出码 ${code}）：${stderr.trim().split('\n').slice(-3).join('\n')}${hint}`))
          return
        }
        try {
          resolve(JSON.parse(stdout) as SpokenWord[])
        } catch {
          reject(new Error(`edge-tts 输出无法解析：${stdout.slice(0, 200)}`))
        }
      })
    })
  },
}

/** 音频时长，秒。 */
export async function probeDuration(file: string): Promise<number> {
  const out = await runFfmpeg(['-i', file, '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1'], { stdout: 'buffer' })
  return out.length / 4 / 48000
}

export type CachedTtsOptions = {
  engine?: TtsEngine
  cacheDir: string
  /** 缓存里没有时报错而不是去合成。CI 和 worker 进程里用。 */
  offline?: boolean
}

/** 缓存键：引擎、声音、语速、音高、音量、文字。改一个字就是一条新录音。 */
export function ttsKey(engine: TtsEngine, req: TtsRequest): string {
  const h = createHash('sha256')
  h.update(JSON.stringify([engine.name, req.voice, req.rate ?? '', req.pitch ?? '', req.volume ?? '', req.text]))
  return h.digest('hex').slice(0, 16)
}

const pending = new Map<string, Promise<TtsResult>>()

/**
 * 带缓存的合成。缓存是两个文件：<键>.<扩展名> 和 <键>.json（逐词时间、时长、原文）。
 * 先写临时文件再改名，多个进程同时合成同一句也不会读到半个文件。
 */
export function synthesizeCached(req: TtsRequest, opts: CachedTtsOptions): Promise<TtsResult> {
  const engine = opts.engine ?? edgeTts
  const key = ttsKey(engine, req)
  const audio = join(opts.cacheDir, `${key}.${engine.ext}`)
  const meta = join(opts.cacheDir, `${key}.json`)
  let p = pending.get(audio)
  if (p) return p
  p = (async () => {
    if (existsSync(audio) && existsSync(meta)) {
      const m = JSON.parse(await readFile(meta, 'utf8')) as { duration: number; words: SpokenWord[] }
      return { file: audio, duration: m.duration, words: m.words }
    }
    if (opts.offline) throw new Error(`旁白缓存里没有这句（${engine.name} ${req.voice}）：${req.text}`)
    await mkdir(opts.cacheDir, { recursive: true })
    const tmp = `${audio}.${process.pid}.tmp`
    try {
      const words = await engine.synthesize(req, tmp)
      const duration = await probeDuration(tmp)
      await rename(tmp, audio)
      const body = { engine: engine.name, ...req, duration: Math.round(duration * 1e4) / 1e4, words }
      await writeFile(`${meta}.${process.pid}.tmp`, JSON.stringify(body, null, 1))
      await rename(`${meta}.${process.pid}.tmp`, meta)
      return { file: audio, duration: body.duration, words }
    } finally {
      await rm(tmp, { force: true })
    }
  })()
  pending.set(audio, p)
  return p
}
