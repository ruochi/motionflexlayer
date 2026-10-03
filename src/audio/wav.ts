import type { Stereo } from './types.js'

/** 16 位立体声 PCM WAV。带 TPDF 抖动，安静段落的尾音不会出量化噪声的“沙沙”声。 */
export function encodeWav({ l, r }: Stereo, sampleRate: number): Buffer {
  const n = l.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 4, 40)
  let seed = 22222
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0
    return seed / 4294967296
  }
  const q = (v: number) => {
    const d = (rand() - rand()) / 32767
    return Math.max(-32768, Math.min(32767, Math.round((v + d) * 32767)))
  }
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(q(l[i]!), 44 + i * 4)
    buf.writeInt16LE(q(r[i]!), 46 + i * 4)
  }
  return buf
}
