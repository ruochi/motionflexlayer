export const SR = 48000

export class Bus {
  readonly l: Float32Array
  readonly r: Float32Array
  constructor(readonly length: number) {
    this.l = new Float32Array(length)
    this.r = new Float32Array(length)
  }
  /** Adds a mono sample at index `i` with equal-power pan (-1 left … 1 right). */
  add(i: number, v: number, pan = 0) {
    if (i < 0 || i >= this.length) return
    const a = ((pan + 1) * Math.PI) / 4
    this.l[i]! += v * Math.cos(a)
    this.r[i]! += v * Math.sin(a)
  }
  addStereo(i: number, l: number, r: number) {
    if (i < 0 || i >= this.length) return
    this.l[i]! += l
    this.r[i]! += r
  }
  mixInto(target: Bus, gain = 1) {
    for (let i = 0; i < this.length; i++) {
      target.l[i]! += this.l[i]! * gain
      target.r[i]! += this.r[i]! * gain
    }
  }
}

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const midi = (m: number) => 440 * 2 ** ((m - 69) / 12)

/** RBJ biquad. Coefficients can be changed while running for sweeps. */
export class Biquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  set(kind: 'lp' | 'hp' | 'bp', freq: number, q = 0.707) {
    const f = Math.min(freq, SR * 0.45)
    const w = (2 * Math.PI * f) / SR
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    let b0: number
    let b1: number
    let b2: number
    if (kind === 'lp') {
      b0 = (1 - cos) / 2
      b1 = 1 - cos
      b2 = (1 - cos) / 2
    } else if (kind === 'hp') {
      b0 = (1 + cos) / 2
      b1 = -(1 + cos)
      b2 = (1 + cos) / 2
    } else {
      b0 = alpha
      b1 = 0
      b2 = -alpha
    }
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
    return this
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

/** Band-limited-ish saw via PolyBLEP. */
export function polySaw(phase: number, dt: number) {
  let v = 2 * phase - 1
  if (phase < dt) {
    const t = phase / dt
    v -= t + t - t * t - 1
  } else if (phase > 1 - dt) {
    const t = (phase - 1) / dt
    v -= t * t + t + t + 1
  }
  return v
}

/** Attack/decay/sustain/release envelope evaluated at time `t` seconds for a note of `len` seconds. */
export function adsr(t: number, len: number, a: number, d: number, s: number, r: number) {
  if (t < 0) return 0
  let v: number
  if (t < a) v = t / a
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d)
  else v = s
  if (t > len) {
    const k = (t - len) / r
    if (k >= 1) return 0
    const held = len < a ? len / a : len < a + d ? 1 - (1 - s) * ((len - a) / d) : s
    return held * (1 - k)
  }
  return v
}

/** Freeverb-style stereo reverb: parallel combs into series allpasses. */
export function reverb(input: Bus, out: Bus, opts: { room?: number; damp?: number; wet?: number } = {}) {
  const room = opts.room ?? 0.84
  const damp = opts.damp ?? 0.3
  const wet = opts.wet ?? 1
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
  const alls = [556, 441, 341, 225]
  const scale = SR / 44100
  for (const [ch, spread] of [
    ['l', 0],
    ['r', 23],
  ] as const) {
    const src = input[ch]
    const dst = out[ch]
    const cb = combs.map((c) => ({ buf: new Float32Array(Math.round((c + spread) * scale)), i: 0, store: 0 }))
    const ab = alls.map((a) => ({ buf: new Float32Array(Math.round((a + spread) * scale)), i: 0 }))
    for (let n = 0; n < src.length; n++) {
      const x = src[n]! * 0.015
      let acc = 0
      for (const c of cb) {
        const y = c.buf[c.i]!
        c.store = y * (1 - damp) + c.store * damp
        c.buf[c.i] = x + c.store * room
        c.i = (c.i + 1) % c.buf.length
        acc += y
      }
      for (const a of ab) {
        const b = a.buf[a.i]!
        const y = -acc + b
        a.buf[a.i] = acc + b * 0.5
        a.i = (a.i + 1) % a.buf.length
        acc = y
      }
      dst[n]! += acc * wet
    }
  }
}

/** Stereo ping-pong delay. */
export function pingPong(input: Bus, out: Bus, seconds: number, feedback: number, wet: number) {
  const d = Math.round(seconds * SR)
  const bl = new Float32Array(d)
  const br = new Float32Array(d)
  const lp = new Biquad().set('lp', 3500)
  let i = 0
  for (let n = 0; n < input.length; n++) {
    const dl = bl[i]!
    const dr = br[i]!
    const mono = (input.l[n]! + input.r[n]!) * 0.5
    bl[i] = lp.run(mono + dr * feedback)
    br[i] = dl * feedback
    i = (i + 1) % d
    out.l[n]! += dl * wet
    out.r[n]! += dr * wet
  }
}

export function encodeWav(bus: Bus) {
  const n = bus.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, bus.l[i]!))
    const r = Math.max(-1, Math.min(1, bus.r[i]!))
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4)
  }
  return buf
}
