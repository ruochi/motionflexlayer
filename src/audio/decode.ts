import { runFfmpeg } from '../render/ffmpeg.js'
import type { Stereo } from './types.js'

const cache = new Map<string, Promise<Stereo>>()

/** 用 ffmpeg 把任意音频文件解码成指定采样率的立体声浮点。单声道会复制到两边。 */
export function decodeAudio(path: string, sampleRate: number): Promise<Stereo> {
  const key = `${sampleRate}:${path}`
  let p = cache.get(key)
  if (!p) {
    p = runFfmpeg(['-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(sampleRate), 'pipe:1'], {
      stdout: 'buffer',
    }).then((buf) => {
      const n = Math.floor(buf.length / 8)
      const l = new Float32Array(n)
      const r = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        l[i] = buf.readFloatLE(i * 8)
        r[i] = buf.readFloatLE(i * 8 + 4)
      }
      return { l, r }
    })
    cache.set(key, p)
  }
  return p
}
