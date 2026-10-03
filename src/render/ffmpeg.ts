import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

let cached: string | undefined

/**
 * ffmpeg 可执行文件。顺序：环境变量 MFL_FFMPEG / FFMPEG_PATH → 可选依赖 ffmpeg-static → PATH 里的 ffmpeg。
 */
export async function ffmpegPath(): Promise<string> {
  if (cached) return cached
  for (const env of [process.env.MFL_FFMPEG, process.env.FFMPEG_PATH]) {
    if (env && existsSync(env)) return (cached = env)
  }
  try {
    const mod = (await import('ffmpeg-static' as string)) as { default?: string }
    if (mod.default && existsSync(mod.default)) return (cached = mod.default)
  } catch {
    // 没装 ffmpeg-static
  }
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  if (probe.status === 0) return (cached = 'ffmpeg')
  throw new Error('找不到 ffmpeg。安装 ffmpeg 并加入 PATH，或设置环境变量 MFL_FFMPEG=/path/to/ffmpeg')
}

/** 跑一次 ffmpeg，失败时把 stderr 带进错误。 */
export async function runFfmpeg(args: string[], opts: { stdout?: 'buffer' } = {}): Promise<Buffer> {
  const bin = await ffmpegPath()
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    let err = ''
    p.stdout.on('data', (d: Buffer) => {
      if (opts.stdout === 'buffer') out.push(d)
    })
    p.stderr.on('data', (d: Buffer) => (err += d.toString()))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg 退出码 ${code}\n${err}`))))
  })
}
