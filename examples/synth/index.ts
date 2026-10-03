/**
 * 示例：离线合成器。不属于框架核心，演示“音源可以是函数”：
 * 用 synthSource(build) 包一层，就能和音频文件一样放进 audio.clips。
 *
 * 所有乐器都是“在第 t0 秒往某条母线写采样”的函数，时间直接取自时间轴的 cue，
 * 声音和画面天然同源。
 */
import { TAU, clamp, rng, type AudioSource, type Stereo } from 'motionflexlayer'

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)

export function panGains(pan: number): [number, number] {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4
  return [Math.cos(a), Math.sin(a)]
}

export type Send = { rev?: number; dly?: number }

type Bus = Stereo

export class Biquad {
  b0 = 1
  b1 = 0
  b2 = 0
  a1 = 0
  a2 = 0
  x1 = 0
  x2 = 0
  y1 = 0
  y2 = 0
  constructor(private readonly sr: number) {}
  set(type: 'lp' | 'hp' | 'bp', f: number, q = 0.707) {
    const w = (TAU * clamp(f, 10, this.sr * 0.45)) / this.sr
    const cs = Math.cos(w)
    const al = Math.sin(w) / (2 * q)
    let b0: number, b1: number, b2: number
    if (type === 'lp') [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2]
    else if (type === 'hp') [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2]
    else [b0, b1, b2] = [al, 0, -al]
    const a0 = 1 + al
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = (-2 * cs) / a0
    this.a2 = (1 - al) / a0
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

function polyblep(p: number, dt: number) {
  if (p < dt) {
    const x = p / dt
    return x + x - x * x - 1
  }
  if (p > 1 - dt) {
    const x = (p - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}

class Saw {
  constructor(
    private readonly sr: number,
    private p: number,
  ) {}
  next(f: number) {
    const dt = f / this.sr
    this.p += dt
    if (this.p >= 1) this.p -= 1
    return 2 * this.p - 1 - polyblep(this.p, dt)
  }
}

export type SynthOptions = { sampleRate: number; duration: number; seed?: number }

export type MixdownOptions = {
  /** 音乐母线的闪避曲线，t → 增益。 */
  duckMusic?: (t: number) => number
  /** 混响、延迟回送量。 */
  reverb?: number
  delay?: number
  /** 延迟时间，秒。通常取一拍的 3/4。 */
  delayTime?: number
}

export class Synth {
  readonly sr: number
  readonly len: number
  readonly drums: Bus
  readonly music: Bus
  readonly fx: Bus
  private readonly rev: Bus
  private readonly dly: Bus
  private readonly rand: () => number

  constructor(opts: SynthOptions) {
    this.sr = opts.sampleRate
    this.len = Math.ceil(opts.duration * this.sr)
    const bus = (): Bus => ({ l: new Float32Array(this.len), r: new Float32Array(this.len) })
    this.drums = bus()
    this.music = bus()
    this.fx = bus()
    this.rev = bus()
    this.dly = bus()
    this.rand = rng(opts.seed ?? 42)
  }

  private noise = () => this.rand() * 2 - 1
  private idx = (t: number) => Math.round(t * this.sr)
  private saw = (phase?: number) => new Saw(this.sr, phase ?? this.rand())
  private bq = () => new Biquad(this.sr)

  write(b: Bus, i: number, l: number, r: number, send: Send = {}) {
    if (i < 0 || i >= this.len) return
    b.l[i]! += l
    b.r[i]! += r
    if (send.rev) {
      this.rev.l[i]! += l * send.rev
      this.rev.r[i]! += r * send.rev
    }
    if (send.dly) {
      this.dly.l[i]! += l * send.dly
      this.dly.r[i]! += r * send.dly
    }
  }

  // ---------------------------------------------------------------- 鼓

  kick(t0: number, g = 1) {
    const n0 = this.idx(t0)
    let ph = 0
    for (let n = 0; n < this.sr * 0.5; n++) {
      const tt = n / this.sr
      ph += (TAU * (50 + 140 * Math.exp(-tt * 30))) / this.sr
      const amp = Math.exp(-tt * 8.5) * Math.min(1, tt / 0.0015)
      const click = this.noise() * Math.exp(-tt * 420) * 0.3
      const v = Math.tanh(1.7 * (Math.sin(ph) * amp + click)) * g
      this.write(this.drums, n0 + n, v, v, { rev: 0.02 })
    }
  }

  clap(t0: number, g = 1) {
    const n0 = this.idx(t0)
    const fl = this.bq().set('bp', 1350, 0.9)
    const fr = this.bq().set('bp', 1500, 0.9)
    for (let n = 0; n < this.sr * 0.5; n++) {
      const tt = n / this.sr
      let env = 0
      for (const k of [0, 0.011, 0.023]) if (tt >= k) env = Math.max(env, Math.exp(-(tt - k) * 190))
      if (tt >= 0.03) env = Math.max(env, 0.75 * Math.exp(-(tt - 0.03) * 13))
      this.write(this.drums, n0 + n, fl.run(this.noise()) * env * g * 2.2, fr.run(this.noise()) * env * g * 2.2, { rev: 0.22 })
    }
  }

  hat(t0: number, g: number, open = false, pan = 0.15) {
    const n0 = this.idx(t0)
    const f = this.bq().set('hp', 7600, 0.8)
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * (open ? 0.35 : 0.07); n++) {
      const tt = n / this.sr
      const v = f.run(this.noise()) * Math.exp(-tt * (open ? 11 : 60)) * g
      this.write(this.drums, n0 + n, v * gl, v * gr, { rev: open ? 0.08 : 0.03 })
    }
  }

  // ---------------------------------------------------------------- 乐器

  bass(t0: number, dur: number, midi: number, g: number) {
    const n0 = this.idx(t0)
    const f = mtof(midi)
    const saw = this.saw(0)
    let sub = 0
    const lp = this.bq()
    for (let n = 0; n < this.sr * (dur + 0.06); n++) {
      const tt = n / this.sr
      if (n % 16 === 0) lp.set('lp', 160 + 1500 * Math.exp(-tt * 10), 1.1)
      sub += (TAU * f) / this.sr
      const amp = Math.min(1, tt / 0.004) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.06) : 1)
      const v = Math.tanh(1.4 * (lp.run(saw.next(f)) * 0.7 + Math.sin(sub) * 0.6)) * amp * g
      this.write(this.music, n0 + n, v, v)
    }
  }

  pad(t0: number, dur: number, midis: number[], g: number, cutoff: number, attack = 0.6, release = 1.2) {
    const n0 = this.idx(t0)
    const lpl = this.bq().set('lp', cutoff, 0.6)
    const lpr = this.bq().set('lp', cutoff * 1.05, 0.6)
    const voices = midis.map((m) => ({
      l: [-9, 0, 8].map((c) => ({ o: this.saw(), f: mtof(m) * 2 ** (c / 1200) })),
      r: [-6, 3, 11].map((c) => ({ o: this.saw(), f: mtof(m) * 2 ** (c / 1200) })),
    }))
    const norm = g / (midis.length * 3)
    for (let n = 0; n < this.sr * (dur + release); n++) {
      const tt = n / this.sr
      let env = Math.min(1, tt / attack)
      env = env * env * (3 - 2 * env)
      if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / release) ** 2
      let l = 0
      let r = 0
      for (const v of voices) {
        for (const o of v.l) l += o.o.next(o.f)
        for (const o of v.r) r += o.o.next(o.f)
      }
      this.write(this.music, n0 + n, lpl.run(l) * env * norm, lpr.run(r) * env * norm, { rev: 0.4 })
    }
  }

  supersaw(t0: number, dur: number, midis: number[], g: number, cutoff = 4200) {
    const n0 = this.idx(t0)
    const release = 0.25
    const det = [-22, -14, -6, 0, 6, 14, 22]
    const voices = midis.flatMap((m) =>
      det.map((c, k) => {
        const [gl, gr] = panGains(((k / (det.length - 1)) * 2 - 1) * 0.8)
        return { o: this.saw(), f: mtof(m) * 2 ** (c / 1200), gl, gr }
      }),
    )
    const lpl = this.bq().set('lp', cutoff, 0.7)
    const lpr = this.bq().set('lp', cutoff, 0.7)
    const norm = g / voices.length
    for (let n = 0; n < this.sr * (dur + release); n++) {
      const tt = n / this.sr
      let env = Math.min(1, tt / 0.015)
      if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / release)
      let l = 0
      let r = 0
      for (const v of voices) {
        const s = v.o.next(v.f)
        l += s * v.gl
        r += s * v.gr
      }
      this.write(this.music, n0 + n, lpl.run(l) * env * norm, lpr.run(r) * env * norm, { rev: 0.18 })
    }
  }

  bell(t0: number, midi: number, g: number, pan = 0, decay = 2.0, bright = 1, send: Send = { rev: 0.4, dly: 0.32 }) {
    const n0 = this.idx(t0)
    const f = mtof(midi)
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * 3.2; n++) {
      const tt = n / this.sr
      const mod = Math.sin(TAU * f * 3.5 * tt) * bright * 2.6 * Math.exp(-tt * 4)
      const amp = Math.exp(-tt * decay) * Math.min(1, tt / 0.002)
      const v = (Math.sin(TAU * f * tt + mod) + Math.sin(TAU * f * 2 * tt) * 0.12 * Math.exp(-tt * 5)) * amp * g
      this.write(this.fx, n0 + n, v * gl, v * gr, send)
    }
  }

  pluck(t0: number, midi: number, g: number, pan = 0) {
    const n0 = this.idx(t0)
    const f = mtof(midi)
    const o1 = this.saw()
    const o2 = this.saw()
    const lp = this.bq()
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * 0.6; n++) {
      const tt = n / this.sr
      if (n % 16 === 0) lp.set('lp', 300 + 4200 * Math.exp(-tt * 16), 0.9)
      const v = lp.run(o1.next(f) + o2.next(f * 1.005)) * Math.exp(-tt * 7) * Math.min(1, tt / 0.002) * g
      this.write(this.music, n0 + n, v * gl, v * gr, { dly: 0.25, rev: 0.2 })
    }
  }

  marimba(t0: number, midi: number, g: number, pan = 0) {
    const n0 = this.idx(t0)
    const f = mtof(midi)
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * 0.8; n++) {
      const tt = n / this.sr
      const v =
        (Math.sin(TAU * f * tt) * Math.exp(-tt * 8) + Math.sin(TAU * f * 4 * tt) * 0.25 * Math.exp(-tt * 24)) *
        Math.min(1, tt / 0.001) *
        g
      this.write(this.fx, n0 + n, v * gl, v * gr, { rev: 0.25, dly: 0.15 })
    }
  }

  // ---------------------------------------------------------------- 音效

  riser(t0: number, t1: number, g: number, f0 = 300, f1 = 8000) {
    const n0 = this.idx(t0)
    const N = this.idx(t1) - n0
    const bl = this.bq()
    const br = this.bq()
    let ph = 0
    for (let n = 0; n < N; n++) {
      const x = n / N
      const f = f0 * (f1 / f0) ** x
      if (n % 16 === 0) {
        bl.set('bp', f, 1.6)
        br.set('bp', f * 1.04, 1.6)
      }
      ph += (TAU * 220 * 4 ** x) / this.sr
      const amp = x ** 2.2 * g * Math.min(1, (N - n) / (this.sr * 0.01))
      const tone = Math.sin(ph) * 0.18 * x * x
      this.write(this.fx, n0 + n, (bl.run(this.noise()) * 2.2 + tone) * amp, (br.run(this.noise()) * 2.2 + tone) * amp, { rev: 0.3 })
    }
  }

  revCymbal(t0: number, t1: number, g: number) {
    const n0 = this.idx(t0)
    const N = this.idx(t1) - n0
    const hl = this.bq().set('hp', 4800, 0.7)
    const hr = this.bq().set('hp', 5200, 0.7)
    for (let n = 0; n < N; n++) {
      const amp = (n / N) ** 3 * g * Math.min(1, (N - n) / (this.sr * 0.006))
      this.write(this.fx, n0 + n, hl.run(this.noise()) * amp, hr.run(this.noise()) * amp, { rev: 0.25 })
    }
  }

  impact(t0: number, g: number, size = 1) {
    const n0 = this.idx(t0)
    const lp = this.bq().set('lp', 900, 0.7)
    const hl = this.bq().set('hp', 3500, 0.7)
    const hr = this.bq().set('hp', 3800, 0.7)
    let ph = 0
    for (let n = 0; n < this.sr * 3.2 * size; n++) {
      const tt = n / this.sr
      ph += (TAU * (32 + 75 * Math.exp(-tt * 2.4))) / this.sr
      const sub = Math.sin(ph) * Math.exp(-tt * (2.0 / size)) * Math.min(1, tt / 0.002)
      const body = lp.run(this.noise()) * Math.exp(-tt * 7) * 1.6
      const crash = Math.exp(-tt * (1.7 / size)) * 0.32
      const v = Math.tanh(1.3 * (sub + body)) * g
      this.write(this.fx, n0 + n, v + hl.run(this.noise()) * crash * g, v + hr.run(this.noise()) * crash * g, { rev: 0.45 * size })
    }
  }

  whoosh(t0: number, dur: number, g: number, panFrom = -0.6, panTo = 0.6, f0 = 380, f1 = 3200) {
    const n0 = this.idx(t0)
    const N = Math.round(dur * this.sr)
    const bp = this.bq()
    for (let n = 0; n < N; n++) {
      const x = n / N
      if (n % 16 === 0) bp.set('bp', f0 * (f1 / f0) ** Math.sin(Math.PI * x), 1.1)
      const [gl, gr] = panGains(panFrom + (panTo - panFrom) * x)
      const v = bp.run(this.noise()) * Math.sin(Math.PI * x) ** 2 * g * 2.4
      this.write(this.fx, n0 + n, v * gl, v * gr, { rev: 0.3 })
    }
  }

  thock(t0: number, g: number, pan = 0) {
    const n0 = this.idx(t0)
    const bp = this.bq().set('bp', 2200, 2)
    const [gl, gr] = panGains(pan)
    let ph = 0
    for (let n = 0; n < this.sr * 0.4; n++) {
      const tt = n / this.sr
      ph += (TAU * 185 * (1 + 0.7 * Math.exp(-tt * 60))) / this.sr
      const v =
        (Math.sin(ph) * Math.exp(-tt * 26) +
          bp.run(this.noise()) * Math.exp(-tt * 130) * 0.9 +
          Math.sin(TAU * 1250 * tt) * Math.exp(-tt * 55) * 0.12) *
        g
      this.write(this.fx, n0 + n, v * gl, v * gr, { rev: 0.12 })
    }
  }

  tick(t0: number, g: number, pan = 0) {
    const n0 = this.idx(t0)
    const hp = this.bq().set('hp', 3800, 0.7)
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * 0.06; n++) {
      const tt = n / this.sr
      const v = (hp.run(this.noise()) * Math.exp(-tt * 520) + Math.sin(TAU * 3100 * tt) * Math.exp(-tt * 170) * 0.28) * g
      this.write(this.fx, n0 + n, v * gl, v * gr, { rev: 0.06 })
    }
  }

  sparkle(t0: number, midi: number, g: number, pan = 0) {
    const n0 = this.idx(t0)
    const f = mtof(midi)
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * 0.9; n++) {
      const tt = n / this.sr
      const mod = Math.sin(TAU * f * 2 * tt) * 0.8 * Math.exp(-tt * 12)
      const v = Math.sin(TAU * f * tt + mod) * Math.exp(-tt * 8) * Math.min(1, tt / 0.001) * g
      this.write(this.fx, n0 + n, v * gl, v * gr, { rev: 0.4, dly: 0.35 })
    }
  }

  ping(t0: number, midi: number, g: number, pan = 0) {
    const n0 = this.idx(t0)
    const f = mtof(midi)
    const [gl, gr] = panGains(pan)
    for (let n = 0; n < this.sr * 1.5; n++) {
      const tt = n / this.sr
      const v =
        (Math.sin(TAU * f * (1 + 0.006 * tt) * tt) + Math.sin(TAU * f * 2 * tt) * 0.15 * Math.exp(-tt * 6)) *
        Math.exp(-tt * 4.2) *
        Math.min(1, tt / 0.002) *
        g
      this.write(this.fx, n0 + n, v * gl, v * gr, { rev: 0.32, dly: 0.28 })
    }
  }

  /** 摩擦声：音量跟 speed(t) 走，声像跟 pan(t) 走。笔尖、划线、拖拽。 */
  scratch(t0: number, t1: number, g: number, speed: (t: number) => number, pan: (t: number) => number) {
    const n0 = this.idx(t0)
    const N = this.idx(t1) - n0
    const bp = this.bq().set('bp', 3300, 0.8)
    const lp = this.bq().set('lp', 500, 0.7)
    let grain = 0
    for (let n = 0; n < N; n++) {
      const t = t0 + n / this.sr
      if (n % 400 === 0) grain = 0.5 + 0.5 * this.rand()
      const k = Math.min(1, n / (this.sr * 0.05), (N - n) / (this.sr * 0.05))
      const s = (bp.run(this.noise()) * (0.55 + 0.45 * grain) + lp.run(this.noise()) * 0.5) * speed(t) * g * k
      const [gl, gr] = panGains(pan(t))
      this.write(this.fx, n0 + n, s * gl, s * gr, { rev: 0.08 })
    }
  }

  subDrop(t0: number, g: number) {
    const n0 = this.idx(t0)
    let ph = 0
    for (let n = 0; n < this.sr * 1.8; n++) {
      const tt = n / this.sr
      ph += (TAU * (30 + 60 * Math.exp(-tt * 1.8))) / this.sr
      const v = Math.sin(ph) * Math.exp(-tt * 1.6) * Math.min(1, tt / 0.01) * g
      this.write(this.fx, n0 + n, v, v)
    }
  }

  // ---------------------------------------------------------------- 混响、延迟、出声

  private freeverb(input: Bus, room = 0.86, damp = 0.32): Bus {
    const out: Bus = { l: new Float32Array(this.len), r: new Float32Array(this.len) }
    const scale = this.sr / 44100
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
    const allps = [556, 441, 341, 225]
    for (const [src, dst, spread] of [
      [input.l, out.l, 0],
      [input.r, out.r, 23],
    ] as const) {
      const cb = combs.map((c) => ({ buf: new Float32Array(Math.round((c + spread) * scale)), i: 0, store: 0 }))
      const ab = allps.map((a) => ({ buf: new Float32Array(Math.round((a + spread) * scale)), i: 0 }))
      for (let n = 0; n < this.len; n++) {
        const x = src[n]! * 0.03
        let y = 0
        for (const c of cb) {
          const o = c.buf[c.i]!
          c.store = o * (1 - damp) + c.store * damp
          c.buf[c.i] = x + c.store * room
          c.i = (c.i + 1) % c.buf.length
          y += o
        }
        for (const a of ab) {
          const b = a.buf[a.i]!
          a.buf[a.i] = y + b * 0.5
          a.i = (a.i + 1) % a.buf.length
          y = -y + b
        }
        dst[n] = y
      }
    }
    return out
  }

  private pingPong(input: Bus, time: number, feedback = 0.38): Bus {
    const out: Bus = { l: new Float32Array(this.len), r: new Float32Array(this.len) }
    const D = Math.round(time * this.sr)
    const bl = new Float32Array(D)
    const br = new Float32Array(D)
    let lpL = 0
    let lpR = 0
    let i = 0
    for (let n = 0; n < this.len; n++) {
      const dl = bl[i]!
      const dr = br[i]!
      lpL += (dl - lpL) * 0.35
      lpR += (dr - lpR) * 0.35
      bl[i] = (input.l[n]! + input.r[n]!) * 0.5 + lpR * feedback
      br[i] = lpL * feedback
      out.l[n] = dl
      out.r[n] = dr
      i = (i + 1) % D
    }
    return out
  }

  /** 母线求和 + 混响/延迟回送 + 去直流 + tanh 软饱和。响度归一交给框架的 master。 */
  mixdown(opts: MixdownOptions = {}): Stereo {
    const verb = this.freeverb(this.rev)
    const echo = this.pingPong(this.dly, opts.delayTime ?? 0.375)
    const echoVerb = this.freeverb({ l: echo.l.map((v) => v * 0.5), r: echo.r.map((v) => v * 0.5) })
    const rv = opts.reverb ?? 0.9
    const dl = opts.delay ?? 0.55
    const L = new Float32Array(this.len)
    const R = new Float32Array(this.len)
    let dcL = 0
    let dcR = 0
    for (let n = 0; n < this.len; n++) {
      const d = opts.duckMusic ? opts.duckMusic(n / this.sr) : 1
      let l = this.drums.l[n]! + this.music.l[n]! * d + this.fx.l[n]! + verb.l[n]! * rv + echo.l[n]! * dl + echoVerb.l[n]!
      let r = this.drums.r[n]! + this.music.r[n]! * d + this.fx.r[n]! + verb.r[n]! * rv + echo.r[n]! * dl + echoVerb.r[n]!
      dcL += (l - dcL) * 0.0005
      dcR += (r - dcR) * 0.0005
      L[n] = Math.tanh((l - dcL) * 0.9)
      R[n] = Math.tanh((r - dcR) * 0.9)
    }
    return { l: L, r: R }
  }
}

/** 把一段编曲包装成音源，放进 audio.clips。 */
export function synthSource(build: (s: Synth) => void, opts: { seed?: number; mixdown?: MixdownOptions; name?: string } = {}): AudioSource {
  return {
    name: opts.name ?? 'synth',
    render: ({ sampleRate, duration }) => {
      const s = new Synth({ sampleRate, duration, seed: opts.seed })
      build(s)
      return s.mixdown(opts.mixdown)
    },
  }
}
