/**
 * 配乐和音效。每个音都从画面用的时间点来：字落进格子时拨一下弦，三行字对齐时敲木琴，印章落下有一声闷响。
 * 段落就是旁白的段落，和弦写在段落上，跟着旁白的长短走。
 */
import type { AudioTrack } from 'motionflexlayer'
import { L, W, type Id } from './kit.js'
import { NAME_TIMES, SNAPS, T_END_SEAL, T_HERE, T_PULL, T_PUSH } from './page.js'
import { T_EXTRUDE, T_GLASS_TEXT, T_HOP_LAND, T_LENS, T_PILL } from './optics.js'
import { RAIN_LANDINGS, T_CELL, T_DRAG, T_FLOOD, T_MERGE, T_POP, T_SEAL, T_TITLE_FLY, T_VERT, VERT_STARTS } from './type.js'

/** 每段一个和弦。D 大调，玻璃和立体两段转到关系小调上，镜头一段回到 IV，收尾落回主和弦。 */
const HARMONY: Record<Id, string> = {
  intro: 'Dadd9',
  glyphs: 'Bm7',
  reflow: 'Gmaj7',
  stroke: 'A',
  glass: 'F#m7',
  solid: 'Em9',
  camera: 'Gmaj7',
  report: 'Asus4',
  outro: 'Dadd9',
}

/** D 大调五声音阶，两个八度。拨弦按字落下的顺序往上走。 */
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]

/** 一组音的力度：开头一个稍重，之后轻轻起伏，免得听起来像机器。 */
const lilt = (i: number, base: number) => base * (i === 0 ? 1.15 : 0.85 + 0.15 * Math.sin(i * 2.4))

function bed(): AudioTrack[] {
  const keys: AudioTrack = {
    id: 'pad',
    instrument: 'epiano',
    brightness: 0.4,
    space: 0.6,
    chords: Object.entries(HARMONY).map(([id, sym]) => ({ in: [id], progression: sym, style: 'pad' as const, register: 'D4' })),
  }
  const bass: AudioTrack = { id: 'bass', instrument: 'sub', gain: -4, follow: 'pad', patterns: [{ grid: '1bar', notes: '1' }] }
  return [keys, bass]
}

/** 字落进格子、改竖排时每个字起步：稀疏地拨，太密的合并掉。 */
function plucks(): AudioTrack {
  const notes: NonNullable<AudioTrack['notes']> = []
  let last = -1
  RAIN_LANDINGS.forEach((t, i) => {
    if (t - last < 0.13) return
    last = t
    notes.push({ at: t, pitch: PENTA[i % PENTA.length]!, velocity: lilt(notes.length, 0.55), duration: 0.5 })
  })
  last = -1
  VERT_STARTS.forEach((t, i) => {
    if (t - last < 0.16) return
    last = t
    notes.push({ at: t, pitch: PENTA[PENTA.length - 1 - (i % PENTA.length)]!, velocity: lilt(i, 0.45), duration: 0.4 })
  })
  return { id: 'pluck', instrument: 'pluck', brightness: 0.75, space: 0.4, pan: -0.2, gain: -3, notes }
}

/** 三行字对齐、三个名字出现：木琴，按主和弦往上。 */
function marimba(): AudioTrack {
  return {
    id: 'marimba',
    instrument: 'marimba',
    brightness: 0.65,
    space: 0.5,
    pan: 0.15,
    notes: [
      ...SNAPS.map((t, i) => ({ at: t, pitch: [69, 74, 78][i]!, velocity: [0.6, 0.65, 0.75][i]!, duration: 0.8 })),
      ...NAME_TIMES.map((t, i) => ({ at: t, pitch: [62, 66, 69][i]!, velocity: [0.55, 0.6, 0.7][i]!, duration: 1.2 })),
      { at: T_END_SEAL, pitch: 74, velocity: 0.8, duration: 2.0 },
    ],
  }
}

type SfxEvent = NonNullable<AudioTrack['sfx']>[number]

const pan = (x: number) => (x / W) * 1.2 - 0.6

/** whoosh 的 at 是最响的那一刻，放在动作中段；riser 的 at 是冲到的那一刻；swell 的 at 是最响处。 */
function effects(): AudioTrack {
  const sfx: SfxEvent[] = [
    { type: 'shimmer', at: 0.4, size: 0.4 },
    { type: 'boom', at: T_SEAL + 0.16, size: 0.25, pan: 0.25 },
    { type: 'whoosh', at: T_TITLE_FLY + 0.15, size: 0.32, direction: 'in' },
    { type: 'tick', at: T_CELL, size: 0.4 },
    { type: 'whoosh', at: T_DRAG + 0.05, size: 0.28, direction: 'out', pan: pan(1500) },
    { type: 'whoosh', at: T_VERT + 0.1, size: 0.32, direction: 'in' },
    { type: 'pop', at: T_MERGE + 0.12, size: 0.35 },
    { type: 'tick', at: T_POP, size: 0.3 },
    { type: 'riser', at: L.stroke.to, duration: L.stroke.to - T_FLOOD + 0.6, size: 0.3 },
    { type: 'impact', at: L.glass.from, size: 0.3 },
    { type: 'whoosh', at: T_PILL + 0.1, size: 0.32, direction: 'in', pan: -0.4 },
    { type: 'shimmer', at: T_LENS, size: 0.4 },
    { type: 'shimmer', at: T_GLASS_TEXT, size: 0.4 },
    { type: 'swell', at: T_EXTRUDE + 0.8, duration: 1.0, size: 0.22 },
    { type: 'hit', at: T_HOP_LAND, size: 0.4, brightness: 0.3 },
    { type: 'whoosh', at: T_PULL + 0.15, size: 0.32, direction: 'out' },
    { type: 'whoosh', at: T_PUSH + 0.2, size: 0.32, direction: 'in' },
    { type: 'click', at: T_HERE, size: 0.3 },
    { type: 'boom', at: T_END_SEAL, size: 0.25 },
  ]
  return { id: 'fx', role: 'sfx', sfx }
}

export const tracks = (): AudioTrack[] => [...bed(), plucks(), marimba(), effects()]
