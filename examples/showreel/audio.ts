/**
 * showreel 的配乐：示例合成器（examples/synth）按时间轴的 cue 现场合成，作为一个音源放进合成。
 * 编曲只读 timeline.ts 里的时间，画面怎么动，声音就在哪里响。
 */
import type { AudioSpec } from 'motionflexlayer'
import { Synth, synthSource } from '../synth/index.js'
import { SPARKLES } from './particles.js'
import { underlineProgress } from './draws.js'
import {
  BAR,
  BEAT,
  CARD_LAND,
  CARD_TIMES,
  CARD_WAVE,
  CODE,
  FORMED,
  GEO_WINDUP,
  HEADLINE,
  IMPLODE_FROM,
  IMPLODE_TO,
  INTRO_BELLS,
  KICKS,
  MORPHS,
  OUTRO_BELLS,
  PEN_FROM,
  PEN_LEN,
  PEN_TO,
  RIPPLES,
  SECTIONS,
  SPACE_MORPHS,
  TITLE_FROM,
  UNDERLINE_FROM,
  UNDERLINE_TO,
  URL_FROM,
  W,
  ZOOM_FROM,
  ZOOM_TO,
  codeCharTimes,
  headlineCharTimes,
  penAt,
  penProgress,
  penSpeed,
} from './timeline.js'
import { clamp, lastIndexAtOrBefore, range } from './compat.js'

const CHORDS = {
  Am: { bass: 33, pad: [57, 60, 64, 71] },
  F: { bass: 29, pad: [53, 57, 60, 64] },
  C: { bass: 36, pad: [55, 60, 64, 71] },
  G: { bass: 31, pad: [55, 59, 62, 69] },
}
const LOOP = [CHORDS.Am, CHORDS.F, CHORDS.C, CHORDS.G]
const ENDING = [CHORDS.Am, CHORDS.F, CHORDS.G, CHORDS.Am]
const chordAt = (bar: number) => (bar >= 20 ? ENDING[bar - 20]! : LOOP[bar % 4]!)

const penPan = (t: number) => (penAt(penProgress(t) * PEN_LEN).p[0] / W) * 1.4 - 0.7

function arrange(syn: Synth) {
  // 底鼓与画面脉冲同源
  for (const k of KICKS) syn.kick(k, k === 40 ? 1.1 : k < 16 ? 0.82 : 0.95)

  for (let bar = 0; bar < 24; bar++) {
    const t = bar * BAR
    const ch = chordAt(bar)
    if (bar < 4) syn.pad(t + (bar === 0 ? 0.3 : 0), BAR, ch.pad, 0.2, 700 + 350 * bar, bar === 0 ? 1.6 : 0.5, 1.0)
    else if (bar < 8) syn.pad(t, BAR, ch.pad, 0.16, 2000, 0.3, 0.9)
    else if (bar < 12) syn.pad(t, BAR, ch.pad, 0.13, 2400, 0.2, 0.8)
    else if (bar < 16) syn.pad(t, BAR, ch.pad, 0.11, 2200, 0.2, 0.8)
    else if (bar < 20) syn.pad(t, bar === 19 ? 1.4 : BAR, ch.pad, 0.08, 2600, 0.1, 0.6)
    else if (bar === 20) syn.pad(t, BAR, [45, ...ch.pad, 76], 0.24, 3200, 0.03, 1.4)
    else syn.pad(t, bar === 23 ? 2.5 : BAR, ch.pad, 0.2, 1800 - (bar - 21) * 300, 0.4, 1.6)

    if (bar >= 4 && bar < 8) {
      for (let k = 0; k < 4; k++) syn.bass(t + k * BEAT, 0.38, ch.bass + 12, 0.3)
      const notes = [...ch.pad.map((m) => m + 12)]
      const pattern = [0, 1, 2, 3, 2, 1, 2, 3]
      pattern.forEach((p, k) => syn.bell(t + k * BEAT / 2, notes[p]!, 0.055, k % 2 ? 0.35 : -0.35, 3.2, 0.6))
    }
    if (bar >= 8 && bar < 12) {
      const steps = [0, 12, 0, 0, 12, 0, 0, 12]
      steps.forEach((s, k) => {
        if (t + k * BEAT / 2 >= FORMED) return
        syn.bass(t + (k * BEAT) / 2, 0.2, ch.bass + 12 + s, 0.28)
      })
    }
    if (bar >= 12 && bar < 16) {
      const steps = [1, 0, 1, 1, 0, 1, 0, 1]
      steps.forEach((on, k) => on && syn.bass(t + (k * BEAT) / 2, 0.2, ch.bass + 12 + (k === 5 ? 12 : 0), 0.3))
      for (const off of [0.75, 1.75]) ch.pad.forEach((m, k) => syn.pluck(t + off, m + 12, 0.06, (k - 1.5) * 0.3))
    }
    if (bar >= 16 && bar < 20) {
      for (let k = 0; k < 4; k++) {
        const tt = t + k * BEAT + BEAT / 2
        if (tt < 39.2) syn.bass(tt, 0.22, ch.bass + 12, 0.34)
      }
      syn.supersaw(t, bar === 19 ? 1.3 : BAR - 0.05, ch.pad.map((m) => m + 12), 0.16, bar === 19 ? 2600 : 4200)
    }
  }

  // 鼓组
  for (const t of range(12, 16, BEAT)) syn.hat(t + BEAT / 2, 0.12)
  for (const t of range(16, 23, BEAT)) {
    if ((t / BEAT) % 2 === 1) syn.clap(t, 0.42)
    for (let k = 0; k < 4; k++) syn.hat(t + (k * BEAT) / 4, k % 2 ? 0.05 : 0.09, false, k % 2 ? 0.3 : -0.1)
  }
  for (let k = 0; k < 8; k++) syn.clap(FORMED + (k * BEAT) / 4, 0.05 + (0.32 * k) / 7)
  for (const t of range(24, 32, BEAT)) {
    if ((t / BEAT) % 2 === 1) syn.clap(t, 0.4)
    if (t < ZOOM_FROM) {
      syn.hat(t + BEAT / 2, 0.1, true)
      syn.hat(t + BEAT / 4, 0.045, false, 0.3)
      syn.hat(t + (3 * BEAT) / 4, 0.045, false, 0.3)
    }
  }
  for (const t of range(32, 39.5, BEAT)) {
    if ((t / BEAT) % 2 === 1) syn.clap(t, 0.45)
    syn.hat(t + BEAT / 2, 0.12, true, -0.2)
    syn.hat(t + BEAT / 4, 0.05, false, 0.35)
    syn.hat(t + (3 * BEAT) / 4, 0.05, false, 0.35)
  }

  // 01 起笔
  syn.ping(1.0, 81, 0.1)
  for (const b of INTRO_BELLS) syn.bell(b.t, b.midi, 0.26, penPan(b.t) * 0.8, 1.6, 1)
  syn.scratch(PEN_FROM, PEN_TO, 0.09, (t) => clamp(penSpeed(t) / 1100), penPan)
  syn.riser(6.0, 8.0, 0.16)
  syn.revCymbal(7.0, 8.0, 0.2)
  for (const s of SECTIONS) {
    syn.tick(s.from + 0.02, 0.05, -0.8)
    syn.tick(s.from + 0.09, 0.035, -0.8)
  }

  // 02 几何
  syn.impact(8, 0.7, 1)
  MORPHS.slice(1).forEach((m, k) => {
    syn.impact(m.t, 0.32, 0.6)
    syn.whoosh(m.t - 0.35, 0.45, 0.13, -0.3, 0.3)
    syn.bell(m.t, [76, 79, 83][k]!, 0.14, 0, 2.4, 1.4)
  })
  RIPPLES.forEach((t, k) => syn.ping(t, [81, 84, 86, 88, 86, 84, 88][k]!, 0.07, (k % 2 ? 1 : -1) * 0.3))
  syn.revCymbal(GEO_WINDUP - 0.5, 16, 0.3)
  syn.riser(14.6, 16, 0.14, 500, 9000)

  // 03 粒子
  syn.impact(16, 1.0, 1.2)
  syn.whoosh(16, 1.2, 0.28, -0.8, 0.8, 300, 4200)
  for (const s of SPARKLES) syn.sparkle(s.t, s.midi, 0.09, s.pan)
  syn.riser(19.4, FORMED, 0.24, 300, 9500)
  syn.revCymbal(22.2, FORMED, 0.2)
  for (const m of [81, 84, 88, 93]) syn.bell(FORMED, m, 0.13, (m - 86) / 10, 1.5, 1.2)
  syn.impact(FORMED, 0.28, 0.5)
  syn.riser(23.25, 24, 0.12, 800, 8000)

  // 04 版式
  syn.impact(24, 0.45, 0.8)
  syn.whoosh(24, 0.8, 0.18, 0, 0, 500, 5000)
  CARD_TIMES.forEach((t, k) => {
    const pan = (k - 1.5) * 0.34
    syn.whoosh(t - 0.05, 0.22, 0.07, pan - 0.2, pan)
    syn.thock(t + CARD_LAND, 0.5, pan)
  })
  headlineCharTimes().forEach((t, k) => {
    if (HEADLINE[k] !== ' ') syn.tick(t, 0.17, (k / HEADLINE.length - 0.5) * 0.6)
  })
  syn.whoosh(27.4, 0.6, 0.06, -0.3, 0.3)
  CARD_WAVE.forEach((t, k) => syn.marimba(t, [69, 72, 76, 79][k]!, 0.22, (k - 1.5) * 0.34))
  syn.whoosh(ZOOM_FROM - 0.1, ZOOM_TO - ZOOM_FROM + 0.1, 0.24, 0.4, 0, 200, 5200)
  syn.riser(ZOOM_FROM, ZOOM_TO, 0.28, 200, 10000)
  syn.revCymbal(31.0, ZOOM_TO, 0.34)

  // 05 空间
  syn.impact(32, 1.1, 1.3)
  syn.subDrop(32, 0.4)
  const melody: Array<[number, number, number]> = [
    [0, 69, 1], [1, 76, 1.5], [2.5, 72, 0.5], [3, 71, 1], [4, 69, 1], [5, 67, 1], [6, 69, 2],
    [8, 69, 1], [9, 76, 1], [10, 79, 1], [11, 77, 1], [12, 76, 2],
  ]
  for (const [b, m] of melody) syn.bell(32 + b * BEAT, m, 0.2, 0, 1.8, 1.3, { rev: 0.35, dly: 0.4 })
  SPACE_MORPHS.slice(1).forEach((t) => {
    syn.whoosh(t - 0.4, 0.75, 0.18, -0.5, 0.5, 300, 4000)
    syn.impact(t, 0.25, 0.6)
  })
  syn.revCymbal(IMPLODE_FROM, IMPLODE_TO, 0.38)
  syn.riser(IMPLODE_FROM - 0.2, IMPLODE_TO, 0.34, 200, 11000)
  for (let k = 0; k < 4; k++) syn.ping(IMPLODE_TO + k * 0.0625, 93, 0.05 * (1 - k * 0.2))

  // 06 落款
  syn.impact(40, 1.3, 1.6)
  syn.subDrop(40, 0.55)
  syn.whoosh(TITLE_FROM - 0.05, 0.9, 0.12, -0.6, 0.6, 600, 6000)
  for (const b of OUTRO_BELLS) syn.bell(b.t, b.midi, 0.24, (b.t - 43) / 6, 1.4, 0.9)
  const ulSpeed = (t: number) => clamp((underlineProgress(t + 0.004) - underlineProgress(t - 0.004)) / 0.008 / 1.2)
  syn.scratch(UNDERLINE_FROM - 0.05, UNDERLINE_TO + 0.05, 0.08, ulSpeed, (t) => (underlineProgress(t) - 0.5) * 0.9)
  codeCharTimes().forEach((t, k) => {
    if (CODE[k] !== ' ') syn.tick(t, 0.11, (k / CODE.length - 0.5) * 0.5)
  })
  syn.ping(URL_FROM, 88, 0.07)
  for (const m of [93, 100]) syn.sparkle(46.0, m, 0.16, 0.2)
  syn.bell(46.0, 81, 0.12, 0, 0.9, 0.5)
}

/** 音乐母线给底鼓让路，越往后压得越深。 */
function duckAt(t: number): number {
  const k = lastIndexAtOrBefore(KICKS, t)
  if (k < 0) return 1
  const x = t - KICKS[k]!
  const depth = t < 16 ? 0.35 : t < 32 ? 0.5 : 0.7
  const env = x < 0.008 ? x / 0.008 : Math.exp(-(x - 0.008) * 8)
  return 1 - depth * env
}

export const audio: AudioSpec = {
  clips: [{ src: synthSource(arrange, { seed: 42, mixdown: { duckMusic: duckAt, delayTime: BEAT * 0.75 } }), at: 0 }],
  master: { normalize: -0.6, fadeOut: 1.2, limit: -0.3 },
}
