/**
 * 配乐和音效。每个音都从画面用的时间点来：字落进格子时拨一下弦，三行字对齐时敲木琴，印章落下有一声闷响。
 */
import { chord, type Track } from 'visualtone'
import { L, W, type Id } from './kit.js'
import { NAME_TIMES, SNAPS, T_END_SEAL, T_HERE, T_PULL, T_PUSH } from './page.js'
import { T_EXTRUDE, T_GLASS_TEXT, T_HOP_LAND, T_LENS, T_PILL } from './optics.js'
import { RAIN_LANDINGS, T_CELL, T_DRAG, T_FLOOD, T_MERGE, T_POP, T_SEAL, T_TITLE_FLY, T_VERT, VERT_STARTS } from './type.js'

/** 每段一个和弦。D 大调，玻璃和立体两段转到关系小调上，镜头一段回到 IV，收尾落回主和弦。 */
const HARMONY: Record<Id, [string, string]> = {
  intro: ['Dadd9', 'D3'],
  glyphs: ['Bm7', 'B2'],
  reflow: ['Gmaj7', 'G2'],
  stroke: ['A', 'A2'],
  glass: ['F#m7', 'F#2'],
  solid: ['Em9', 'E2'],
  camera: ['Gmaj7', 'G2'],
  report: ['Asus4', 'A2'],
  outro: ['Dadd9', 'D3'],
}

/** D 大调五声音阶，两个八度。拨弦按字落下的顺序往上走。 */
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]

function pad(): Track[] {
  const keys: Track = {
    id: 'pad',
    role: 'music',
    engine: 'epiano',
    hue: 205,
    lightness: 0.4,
    space: 0.6,
    release: 1100,
    notes: [],
    duck: { by: 'voice', amount: 0.7, band: [900, 4200], holdMs: 260 },
    // 让出 impact 的中频，低频交给 bass
    eq: { lowShelf: { freq: 160, gain: -5 }, peaks: [{ freq: 546, gain: -3, q: 1 }] },
  }
  const bass: Track = { id: 'bass', role: 'music', hue: 20, lightness: 0.28, release: 500, notes: [] }
  for (const l of Object.values(L)) {
    const [sym, root] = HARMONY[l.id as Id]
    const tones = chord(sym, root)
    const end = l.to
    for (let t = l.from, k = 0; t < end - 0.5; t += 2.4, k++) {
      const len = Math.min(2.8, end - t + 0.4)
      tones.forEach((y, j) => keys.notes!.push({ t: t + j * 0.04, y: y + 12, size: k === 0 ? 0.09 : 0.06, duration: len, ease: 'exp' }))
    }
    bass.notes!.push({ t: l.from, y: tones[0]! - 12, size: 0.006, duration: Math.max(0.6, end - l.from), ease: 'hold' })
  }
  return [keys, bass]
}

/** 字落进格子、改竖排时每个字起步：稀疏地拨，太密的合并掉。 */
function plucks(): Track {
  const notes: NonNullable<Track['notes']> = []
  let last = -1
  RAIN_LANDINGS.forEach((t, i) => {
    if (t - last < 0.13) return
    last = t
    notes.push({ t, y: PENTA[i % PENTA.length]!, size: 0.05, duration: 0.5, ease: 'exp' })
  })
  last = -1
  VERT_STARTS.forEach((t, i) => {
    if (t - last < 0.16) return
    last = t
    notes.push({ t, y: PENTA[PENTA.length - 1 - (i % PENTA.length)]!, size: 0.035, duration: 0.4, ease: 'exp' })
  })
  return { id: 'pluck', role: 'music', engine: 'pluck', hue: 50, lightness: 0.75, space: 0.4, echo: 0.25, pan: -0.2, notes }
}

/** 三行字对齐、三个名字出现：木琴，按主和弦往上。 */
function marimba(): Track {
  const notes: NonNullable<Track['notes']> = [
    ...SNAPS.map((t, i) => ({ t, y: [69, 74, 78][i]!, size: 0.11, duration: 0.8, ease: 'exp' as const })),
    ...NAME_TIMES.map((t, i) => ({ t, y: [62, 66, 69][i]!, size: 0.1, duration: 1.2, ease: 'exp' as const })),
    { t: T_END_SEAL, y: 74, size: 0.12, duration: 2.0, ease: 'exp' },
  ]
  return { id: 'marimba', role: 'music', engine: 'marimba', hue: 35, lightness: 0.65, space: 0.5, pan: 0.15, notes }
}

type SfxEvent = NonNullable<Track['sfx']>[number]

const pan = (x: number) => (x / W) * 1.2 - 0.6

function effects(): Track {
  const sfx: SfxEvent[] = [
    { sfx: 'shimmer', t: 0.4, size: 0.25 },
    { sfx: 'impact', t: T_SEAL + 0.16, size: 0.28, low: 0.5, pan: 0.25 },
    { sfx: 'whoosh', t: T_TITLE_FLY - 0.1, size: 0.3, direction: -0.5 },
    { sfx: 'tick', t: T_CELL, size: 0.25 },
    { sfx: 'whoosh', t: T_DRAG - 0.15, size: 0.2, direction: -0.6, pan: pan(1500) },
    { sfx: 'whoosh', t: T_VERT - 0.1, size: 0.28, direction: 0.4 },
    { sfx: 'pop', t: T_MERGE + 0.12, size: 0.3 },
    { sfx: 'tick', t: T_POP, size: 0.3 },
    { sfx: 'riser', t: T_FLOOD - 0.6, duration: L.stroke.to - T_FLOOD + 0.6, size: 0.35 },
    { sfx: 'impact', t: L.glass.from, size: 0.25, low: 0.3 },
    { sfx: 'whoosh', t: T_PILL - 0.1, size: 0.25, direction: 0.8, pan: -0.4 },
    { sfx: 'shimmer', t: T_LENS, size: 0.25 },
    { sfx: 'shimmer', t: T_GLASS_TEXT, size: 0.35 },
    { sfx: 'swell', t: T_EXTRUDE - 0.1, duration: 1.0, size: 0.3 },
    { sfx: 'impact', t: T_HOP_LAND, size: 0.3, low: 0.6, brightness: 0.2 },
    { sfx: 'whoosh', t: T_PULL - 0.05, size: 0.3, direction: -0.3 },
    { sfx: 'whoosh', t: T_PUSH, size: 0.35, direction: 0.5 },
    { sfx: 'key', t: T_HERE, size: 0.1 },
    { sfx: 'impact', t: T_END_SEAL, size: 0.28, low: 0.5 },
  ]
  return { id: 'fx', role: 'sfx', sfx }
}

export const tracks = (): Track[] => [...pad(), plucks(), marimba(), effects()]
