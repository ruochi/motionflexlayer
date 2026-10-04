/** One clock for picture and sound: 120 BPM at 30 fps puts every beat on a whole frame. */
export const W = 1920
export const H = 1080
export const FPS = 30
export const BPM = 120
export const BEAT = (FPS * 60) / BPM
export const BAR = BEAT * 4
export const DURATION = BAR * 12 + BEAT * 3

export const beat = (n: number) => Math.round(n * BEAT)
export const bar = (n: number) => n * BAR

export const SCENES = {
  intro: { from: 0, to: bar(2) },
  flex: { from: bar(2), to: bar(5) },
  depth: { from: bar(5), to: bar(8) },
  title: { from: bar(8), to: bar(11) },
  outro: { from: bar(11), to: DURATION },
} as const

/** Intro: a dot, a frame, three shapes, then the shapes start to move. */
export const INTRO = {
  dot: beat(1),
  trace: beat(2),
  corners: [beat(3), beat(3) + 2, beat(3) + 4, beat(3) + 6],
  shapes: [beat(4), beat(4) + 4, beat(4) + 8],
  wake: beat(5),
  push: beat(7),
}

/** Flex: every change of CSS lands on a half bar. */
export const FLEX_STATES = [0, 1, 2, 3, 4, 5].map((i) => SCENES.flex.from + i * beat(2))
export const FLEX_STAGGER = 3

/** Depth: the ring steps on every second beat, then winds up into the drop. */
export const DEPTH = {
  fold: SCENES.depth.from,
  steps: [2, 4, 6, 8, 10].map((b) => SCENES.depth.from + beat(b)),
  windup: SCENES.depth.from + beat(8),
  suck: SCENES.depth.to - beat(1),
}

export const TITLE = {
  hit: SCENES.title.from,
  letterStagger: 2,
  underline: SCENES.title.from + beat(3),
  subtitle: SCENES.title.from + beat(4),
  chips: [6, 6.5, 7, 7.5, 8].map((b) => SCENES.title.from + beat(b)),
}

export const OUTRO = {
  collapse: SCENES.outro.from,
  dot: SCENES.outro.from + 18,
  type: SCENES.outro.from + beat(2),
  out: SCENES.outro.from + beat(5) + 8,
}

export const HELLO = 'Hello, motionflexlayer!'
export const TYPE_RATE = 1.5

export type Sfx =
  | { kind: 'pop'; frame: number; pitch: number; gain?: number }
  | { kind: 'tick'; frame: number; pitch?: number; gain?: number }
  | { kind: 'whoosh'; frame: number; length: number; gain?: number; up?: boolean }
  | { kind: 'key'; frame: number; gain?: number }
  | { kind: 'impact'; frame: number }
  | { kind: 'riser'; frame: number; length: number }
  | { kind: 'shimmer'; frame: number; gain?: number }
  | { kind: 'swell'; frame: number; length: number }

/** Every sound effect sits on the same frame as the motion that causes it. */
export function sfxCues(): Sfx[] {
  const cues: Sfx[] = []
  cues.push({ kind: 'pop', frame: INTRO.dot, pitch: 880 })
  cues.push({ kind: 'whoosh', frame: INTRO.trace, length: 22, gain: 0.35, up: true })
  INTRO.corners.forEach((f, i) => cues.push({ kind: 'tick', frame: f, pitch: 2400 + i * 300 }))
  INTRO.shapes.forEach((f, i) => cues.push({ kind: 'pop', frame: f, pitch: [660, 784, 988][i]! }))
  cues.push({ kind: 'shimmer', frame: INTRO.wake, gain: 0.5 })
  cues.push({ kind: 'swell', frame: INTRO.push - beat(2), length: SCENES.flex.from - INTRO.push + beat(2) })
  cues.push({ kind: 'whoosh', frame: INTRO.push, length: SCENES.flex.from - INTRO.push, gain: 0.8, up: true })

  FLEX_STATES.forEach((f, i) => {
    if (i === 0) {
      for (let k = 0; k < 6; k++) cues.push({ kind: 'pop', frame: f + k * FLEX_STAGGER + 6, pitch: 523 * 2 ** ([0, 3, 7, 10, 12, 15][k]! / 12), gain: 0.5 })
    } else {
      cues.push({ kind: 'whoosh', frame: f - 2, length: 14, gain: 0.55 })
    }
  })
  for (const f of FLEX_STATES) {
    const label = flexLabel(FLEX_STATES.indexOf(f))
    for (let c = 0; c < label.length; c += 2) cues.push({ kind: 'key', frame: f + 4 + Math.floor(c / TYPE_RATE), gain: 0.25 })
  }

  cues.push({ kind: 'whoosh', frame: DEPTH.fold, length: 24, gain: 0.7, up: true })
  DEPTH.steps.forEach((f) => cues.push({ kind: 'whoosh', frame: f, length: 10, gain: 0.4 }))
  cues.push({ kind: 'riser', frame: DEPTH.windup, length: TITLE.hit - DEPTH.windup })
  cues.push({ kind: 'impact', frame: TITLE.hit })
  cues.push({ kind: 'shimmer', frame: TITLE.underline, gain: 0.6 })
  TITLE.chips.forEach((f, i) => cues.push({ kind: 'pop', frame: f, pitch: 784 * 2 ** ([0, 2, 4, 7, 9][i]! / 12), gain: 0.45 }))

  cues.push({ kind: 'whoosh', frame: OUTRO.collapse, length: 20, gain: 0.5 })
  cues.push({ kind: 'pop', frame: OUTRO.dot, pitch: 660, gain: 0.55 })
  for (let c = 0; c < HELLO.length; c++) cues.push({ kind: 'key', frame: OUTRO.type + Math.floor(c / TYPE_RATE), gain: 0.4 })
  cues.push({ kind: 'pop', frame: OUTRO.out, pitch: 440, gain: 0.6 })
  return cues
}

export const FLEX_LABELS = [
  'display: flex',
  'justify-content: space-between',
  'align-items: flex-end',
  'justify-content: space-evenly',
  'flex-direction: column',
  'flex: 1',
]

export function flexLabel(i: number) {
  return FLEX_LABELS[i] ?? ''
}
