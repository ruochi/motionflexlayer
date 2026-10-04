import { BAR, BEAT, DURATION, FPS, sfxCues, type Sfx } from '../timeline.js'
import { KICKS_FROM, KICKS_TO } from '../scenes/common.js'
import { Biquad, Bus, SR, adsr, encodeWav, midi, pingPong, polySaw, reverb, rng } from './synth.js'

const SPB = BEAT / FPS
const at = (frame: number) => Math.round((frame / FPS) * SR)
const beatAt = (b: number) => at(b * BEAT)
const barOf = (frame: number) => Math.floor(frame / BAR)

type Chord = { root: number; tones: number[] }
const CH = {
  Am: { root: 33, tones: [57, 60, 64, 71] },
  F: { root: 29, tones: [53, 57, 60, 67] },
  C: { root: 36, tones: [55, 60, 64, 71] },
  G: { root: 31, tones: [55, 59, 62, 69] },
  E: { root: 28, tones: [56, 59, 64, 68] },
} satisfies Record<string, Chord>

/** Chord per bar; bar 10 changes to G halfway. */
const CHORDS: Chord[] = [CH.Am, CH.F, CH.Am, CH.F, CH.C, CH.G, CH.Am, CH.E, CH.Am, CH.F, CH.C, CH.Am, CH.Am]
function chordAt(beatIndex: number): Chord {
  const b = Math.floor(beatIndex / 4)
  if (b === 10 && beatIndex % 4 >= 2) return CH.G
  return CHORDS[Math.min(b, CHORDS.length - 1)]!
}

// ---------- instruments ----------

function kickDrum(bus: Bus, i0: number, gain: number, rand: () => number) {
  const len = Math.round(0.42 * SR)
  let phase = 0
  for (let n = 0; n < len; n++) {
    const t = n / SR
    const f = 46 + 110 * Math.exp(-t / 0.035)
    phase += (2 * Math.PI * f) / SR
    const body = Math.sin(phase) * Math.exp(-t / 0.2)
    const click = n < 120 ? (rand() * 2 - 1) * (1 - n / 120) * 0.25 : 0
    bus.add(i0 + n, Math.tanh((body + click) * 1.6) * gain)
  }
}

function clap(bus: Bus, i0: number, gain: number, rand: () => number) {
  const bp = new Biquad().set('bp', 1400, 0.9)
  const hp = new Biquad().set('hp', 600)
  const len = Math.round(0.28 * SR)
  for (let n = 0; n < len; n++) {
    const t = n / SR
    const bursts = [0, 0.011, 0.022].reduce((a, s) => a + (t >= s ? Math.exp(-(t - s) / 0.006) : 0), 0)
    const env = bursts * 0.6 + Math.exp(-t / 0.09) * 0.5
    const v = hp.run(bp.run(rand() * 2 - 1)) * env
    bus.add(i0 + n, v * gain * 2.2, 0.1)
  }
}

function hat(bus: Bus, i0: number, gain: number, open: boolean, rand: () => number, pan = 0.25) {
  const hp = new Biquad().set('hp', 7500)
  const len = Math.round((open ? 0.3 : 0.06) * SR)
  const decay = open ? 0.11 : 0.018
  for (let n = 0; n < len; n++) {
    const t = n / SR
    bus.add(i0 + n, hp.run(rand() * 2 - 1) * Math.exp(-t / decay) * gain, pan)
  }
}

function bassNote(bus: Bus, i0: number, freq: number, len: number, gain: number, cutoff: number) {
  const lp = new Biquad().set('lp', cutoff, 1.1)
  const total = Math.round((len + 0.08) * SR)
  let ph = 0
  let sub = 0
  for (let n = 0; n < total; n++) {
    const t = n / SR
    const dt = freq / SR
    ph = (ph + dt) % 1
    sub += (2 * Math.PI * freq) / SR
    if (n % 32 === 0) lp.set('lp', cutoff * (1 + 2.5 * Math.exp(-t / 0.05)), 1.1)
    const env = adsr(t, len, 0.004, 0.12, 0.7, 0.06)
    const v = lp.run(polySaw(ph, dt)) * 0.55 + Math.sin(sub) * 0.6
    bus.add(i0 + n, v * env * gain)
  }
}

function padChord(bus: Bus, i0: number, notes: number[], len: number, gain: number, cutoff: number) {
  const total = Math.round((len + 1.2) * SR)
  notes.forEach((m, k) => {
    for (const [detune, pan] of [
      [-0.11, -0.7],
      [0.09, 0.7],
      [0, 0],
    ] as const) {
      const f = midi(m + detune)
      const lp = new Biquad().set('lp', cutoff, 0.6)
      let ph = (k * 0.37 + detune) % 1
      if (ph < 0) ph += 1
      for (let n = 0; n < total; n++) {
        const t = n / SR
        const dt = f / SR
        ph = (ph + dt) % 1
        const env = adsr(t, len, 0.5, 0.6, 0.8, 1.1)
        if (env === 0 && t > len) break
        bus.add(i0 + n, lp.run(polySaw(ph, dt)) * env * gain * 0.33, pan * (0.4 + 0.2 * (k % 2)))
      }
    }
  })
}

/** Karplus-Strong pluck. */
function pluck(bus: Bus, i0: number, freq: number, gain: number, pan: number, rand: () => number, damping = 0.996) {
  const period = Math.max(2, Math.round(SR / freq))
  const buf = new Float32Array(period)
  for (let i = 0; i < period; i++) buf[i] = rand() * 2 - 1
  const len = Math.round(0.9 * SR)
  let idx = 0
  const lp = new Biquad().set('lp', 5200)
  for (let n = 0; n < len; n++) {
    const next = (idx + 1) % period
    const v = buf[idx]!
    buf[idx] = damping * 0.5 * (v + buf[next]!)
    idx = next
    bus.add(i0 + n, lp.run(v) * gain * Math.exp(-n / SR / 0.5), pan)
  }
}

/** Two-operator FM bell, the voice of every pop in the picture. */
function bell(bus: Bus, i0: number, freq: number, gain: number, pan: number, decay = 0.6, ratio = 3.5, index = 2.4) {
  const len = Math.round(decay * 4 * SR)
  let pc = 0
  let pm = 0
  for (let n = 0; n < len; n++) {
    const t = n / SR
    pm += (2 * Math.PI * freq * ratio) / SR
    pc += (2 * Math.PI * freq) / SR
    const idx = index * Math.exp(-t / (decay * 0.3))
    const env = Math.min(1, t / 0.002) * Math.exp(-t / decay)
    bus.add(i0 + n, Math.sin(pc + idx * Math.sin(pm)) * env * gain, pan)
  }
}

function lead(bus: Bus, i0: number, m: number, len: number, gain: number) {
  const f0 = midi(m)
  const lp = new Biquad().set('lp', 2600, 0.8)
  const total = Math.round((len + 0.25) * SR)
  let ph1 = 0
  let ph2 = 0.5
  for (let n = 0; n < total; n++) {
    const t = n / SR
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.25)
    const f = f0 * vib
    ph1 = (ph1 + f / SR) % 1
    ph2 = (ph2 + (f * 1.004) / SR) % 1
    const sq = (ph1 < 0.5 ? 1 : -1) * 0.5 + polySaw(ph2, (f * 1.004) / SR) * 0.5
    const env = adsr(t, len, 0.01, 0.15, 0.65, 0.2)
    bus.add(i0 + n, lp.run(sq) * env * gain, 0)
  }
}

// ---------- sound effects ----------

function whoosh(bus: Bus, i0: number, frames: number, gain: number, up: boolean, rand: () => number) {
  const len = Math.round((frames / FPS + 0.15) * SR)
  const bp = new Biquad()
  const bp2 = new Biquad()
  for (let n = 0; n < len; n++) {
    const k = n / len
    if (n % 16 === 0) {
      const f = up ? 280 * 14 ** k : 3400 * (1 / 7) ** k
      bp.set('bp', f, 1.4)
      bp2.set('bp', f * 1.5, 2)
    }
    const env = Math.sin(Math.PI * Math.min(1, k ** (up ? 1.6 : 0.6))) ** 2
    const x = rand() * 2 - 1
    bus.add(i0 + n, (bp.run(x) + bp2.run(x) * 0.5) * env * gain * 1.6, -0.8 + 1.6 * k)
  }
}

function riser(bus: Bus, i0: number, frames: number, rand: () => number) {
  const len = Math.round((frames / FPS) * SR)
  const hp = new Biquad()
  let ph = 0
  for (let n = 0; n < len; n++) {
    const k = n / len
    if (n % 32 === 0) hp.set('hp', 300 + 5000 * k * k, 1.2)
    const f = 110 * 2 ** (3.2 * k)
    ph = (ph + f / SR) % 1
    const env = k ** 2.2
    const noise = hp.run(rand() * 2 - 1)
    bus.add(i0 + n, (noise * 0.6 + polySaw(ph, f / SR) * 0.12) * env * 0.9, Math.sin(k * 40) * 0.5 * k)
  }
}

function swell(bus: Bus, i0: number, frames: number, rand: () => number) {
  const len = Math.round((frames / FPS) * SR)
  const hp = new Biquad().set('hp', 2500)
  for (let n = 0; n < len; n++) {
    const k = n / len
    bus.add(i0 + n, hp.run(rand() * 2 - 1) * k ** 3 * 0.35, 0)
  }
}

function impact(bus: Bus, i0: number, rand: () => number) {
  const len = Math.round(2.2 * SR)
  const hp = new Biquad().set('hp', 1800)
  let ph = 0
  for (let n = 0; n < len; n++) {
    const t = n / SR
    const f = 30 + 70 * Math.exp(-t / 0.08)
    ph += (2 * Math.PI * f) / SR
    const boom = Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-t / 0.6)
    const crash = hp.run(rand() * 2 - 1) * Math.exp(-t / 0.55)
    bus.addStereo(i0 + n, boom * 0.9 + crash * 0.45, boom * 0.9 + crash * 0.45 * (0.8 + 0.2 * rand()))
  }
}

function key(bus: Bus, i0: number, gain: number, rand: () => number) {
  const bp = new Biquad().set('bp', 2600 + rand() * 1800, 2.5)
  const len = Math.round(0.03 * SR)
  const pan = rand() * 0.6 - 0.3
  for (let n = 0; n < len; n++) {
    const t = n / SR
    const v = bp.run(rand() * 2 - 1) * Math.exp(-t / 0.004) * 2.5 + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.006) * 0.4
    bus.add(i0 + n, v * gain, pan)
  }
}

function tick(bus: Bus, i0: number, pitch: number, gain: number) {
  const len = Math.round(0.04 * SR)
  for (let n = 0; n < len; n++) {
    const t = n / SR
    bus.add(i0 + n, Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t / 0.007) * gain, 0.3)
  }
}

function pop(bus: Bus, i0: number, pitch: number, gain: number) {
  const len = Math.round(0.12 * SR)
  let ph = 0
  for (let n = 0; n < len; n++) {
    const t = n / SR
    const f = pitch * (0.6 + 0.4 * (1 - Math.exp(-t / 0.012)))
    ph += (2 * Math.PI * f) / SR
    bus.add(i0 + n, Math.sin(ph) * Math.exp(-t / 0.03) * gain * 0.6)
  }
  bell(bus, i0, pitch * 2, gain * 0.18, 0, 0.25, 2, 1.2)
}

function shimmer(bus: Bus, i0: number, gain: number) {
  ;[88, 93, 95, 100, 105].forEach((m, k) => bell(bus, i0 + Math.round(k * 0.045 * SR), midi(m), gain * 0.12, -0.6 + k * 0.3, 0.7, 1.41, 1.6))
}

function playSfx(cue: Sfx, dry: Bus, send: Bus, rand: () => number) {
  const i0 = at(cue.frame)
  switch (cue.kind) {
    case 'pop':
      pop(dry, i0, cue.pitch, cue.gain ?? 0.7)
      pop(send, i0, cue.pitch, (cue.gain ?? 0.7) * 0.5)
      break
    case 'tick':
      tick(dry, i0, cue.pitch ?? 2400, cue.gain ?? 0.25)
      break
    case 'whoosh':
      whoosh(dry, i0 - Math.round(0.05 * SR), cue.length, cue.gain ?? 0.5, cue.up ?? false, rand)
      break
    case 'key':
      key(dry, i0, cue.gain ?? 0.3, rand)
      break
    case 'impact':
      impact(dry, i0, rand)
      impact(send, i0, rand)
      break
    case 'riser':
      riser(dry, i0, cue.length, rand)
      break
    case 'shimmer':
      shimmer(dry, i0, cue.gain ?? 0.5)
      shimmer(send, i0, (cue.gain ?? 0.5) * 1.2)
      break
    case 'swell':
      swell(dry, i0, cue.length, rand)
      break
  }
}

// ---------- arrangement ----------

const MELODY: Array<[number, number, number]> = [
  [0, 76, 0.5], [1, 81, 0.75], [2, 79, 0.5], [2.5, 76, 0.5], [3.5, 74, 0.5],
  [4, 72, 0.75], [5, 74, 0.5], [5.5, 76, 1], [7, 72, 0.5], [7.5, 69, 0.5],
  [8, 67, 0.5], [8.5, 71, 0.5], [9, 74, 0.5], [9.5, 79, 1], [11, 81, 0.5], [11.5, 83, 0.5],
  [12, 81, 2.5],
]

export function renderScore(): Buffer {
  const total = at(DURATION) + Math.round(0.02 * SR)
  const drums = new Bus(total)
  const music = new Bus(total)
  const leadBus = new Bus(total)
  const sfx = new Bus(total)
  const send = new Bus(total)
  const rand = rng(7)

  const totalBeats = Math.floor(DURATION / BEAT)
  const buildFrom = 7 * 4
  const dropBeat = 8 * 4

  for (let b = 0; b < totalBeats; b++) {
    const frame = b * BEAT
    const i0 = beatAt(b)
    const inGroove = frame >= KICKS_FROM && frame < KICKS_TO
    const silentBreak = b === dropBeat - 1
    if (inGroove && !silentBreak) {
      kickDrum(drums, i0, 0.95, rand)
      const bar = barOf(frame)
      if (b % 2 === 1 && bar >= 3 && b < buildFrom) clap(drums, i0, 0.5, rand)
      if (b >= dropBeat && b % 2 === 1) clap(drums, i0, 0.55, rand)
      const open = bar >= 5
      hat(drums, i0 + beatAt(0.5), open ? 0.16 : 0.2, open, rand)
      if (bar >= 3) for (const s of [0.25, 0.75]) hat(drums, i0 + beatAt(s), 0.07, false, rand, -0.3)
    }
    if (b >= buildFrom && b < dropBeat - 1) {
      const sub = b < buildFrom + 2 ? 2 : 4
      for (let s = 0; s < sub; s++) clap(drums, i0 + beatAt(s / sub), 0.18 + 0.32 * ((b - buildFrom) / 4), rand)
    }
  }

  for (let b = 0; b < totalBeats; b++) {
    const frame = b * BEAT
    const chord = chordAt(b)
    const i0 = beatAt(b)
    const bar = barOf(frame)
    if (frame >= KICKS_FROM && frame < KICKS_TO && b !== dropBeat - 1) {
      const cutoff = bar === 7 ? 400 + 1400 * ((b % 4) / 4) : bar >= 8 ? 900 : 600
      for (const s of [0, 0.5]) {
        const m = chord.root + (s === 0.5 && b % 2 === 1 ? 12 : 0)
        bassNote(music, i0 + beatAt(s), midi(m), SPB * 0.42, 0.42, cutoff)
      }
    }
    if (bar >= 2 && bar < 11 && b !== dropBeat - 1) {
      const tones = chord.tones
      const pattern = [0, 1, 2, 3, 2, 1, 2, 3]
      for (let s = 0; s < 4; s++) {
        const step = (b * 4 + s) % pattern.length
        const oct = bar >= 5 && bar < 8 ? 12 : bar >= 8 ? 12 : 0
        const m = tones[pattern[step]!]! + oct
        const g = bar === 2 ? 0.1 + 0.1 * ((b % 4) / 4) : 0.2
        const i = i0 + beatAt(s / 4)
        pluck(music, i, midi(m), g, s % 2 ? 0.45 : -0.45, rand)
        pluck(send, i, midi(m), g * 0.4, 0, rand)
      }
    }
  }

  CHORDS.forEach((chord, bar) => {
    const frame = bar * BAR
    if (frame >= DURATION) return
    const len = Math.min(BAR, DURATION - frame) / FPS
    const loud = bar < 2 ? 0.2 : bar === 7 ? 0.14 : bar >= 11 ? 0.22 : 0.11
    const cutoff = bar < 2 ? 900 : bar >= 8 && bar < 11 ? 2600 : bar >= 11 ? 1400 : 1600
    const notes = bar === 10 ? [] : chord.tones
    if (notes.length) {
      padChord(music, at(frame), notes, len, loud, cutoff)
      padChord(send, at(frame), notes, len, loud * 0.5, cutoff)
    }
  })
  padChord(music, at(10 * BAR), CH.C.tones, SPB * 2, 0.11, 2600)
  padChord(music, at(10 * BAR + 2 * BEAT), CH.G.tones, SPB * 2, 0.11, 2600)

  for (const [b, m, l] of MELODY) {
    const i = at(8 * BAR) + beatAt(b)
    lead(leadBus, i, m, l * SPB, 0.16)
  }
  leadBus.mixInto(music)
  pingPong(leadBus, music, SPB * 0.75, 0.38, 0.35)
  leadBus.mixInto(send, 0.5)

  for (const cue of sfxCues()) playSfx(cue, sfx, send, rand)

  // Sidechain: everything melodic ducks under the kick.
  const duck = new Float32Array(total).fill(1)
  for (let b = 0; b < totalBeats; b++) {
    const frame = b * BEAT
    if (frame < KICKS_FROM || frame >= KICKS_TO || b === dropBeat - 1) continue
    const i0 = beatAt(b)
    const len = Math.round(SPB * SR)
    for (let n = 0; n < len && i0 + n < total; n++) duck[i0 + n] = Math.min(duck[i0 + n]!, 1 - 0.65 * Math.exp(-n / SR / 0.09))
  }
  for (let i = 0; i < total; i++) {
    music.l[i]! *= duck[i]!
    music.r[i]! *= duck[i]!
  }

  const master = new Bus(total)
  drums.mixInto(master, 0.9)
  music.mixInto(master, 0.8)
  sfx.mixInto(master, 0.9)
  reverb(send, master, { room: 0.86, damp: 0.35, wet: 2.4 })

  const hp = [new Biquad().set('hp', 28), new Biquad().set('hp', 28)]
  let peak = 0
  for (let i = 0; i < total; i++) {
    master.l[i] = Math.tanh(hp[0]!.run(master.l[i]!) * 1.1)
    master.r[i] = Math.tanh(hp[1]!.run(master.r[i]!) * 1.1)
    peak = Math.max(peak, Math.abs(master.l[i]!), Math.abs(master.r[i]!))
  }
  const norm = 0.89 / peak
  const fadeOut = Math.round(0.35 * SR)
  for (let i = 0; i < total; i++) {
    const tail = Math.min(1, (total - i) / fadeOut)
    master.l[i]! *= norm * tail
    master.r[i]! *= norm * tail
  }
  return encodeWav(master)
}
