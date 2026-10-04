import { checkFvg } from '@dc/flexlayer'
import { H, W } from './timeline.js'

export type Box = { x: number; y: number; w: number; h: number; r: number }

export const STAGE = { cx: W / 2, cy: 500, w: 1280, h: 520 }

type ItemStyle = { w?: number; h?: number; grow?: boolean; r: number }

type FlexState = { container: string; items: ItemStyle[] }

const COUNT = 6
const sq = (w: number, h: number, r = 22): ItemStyle => ({ w, h, r })
const repeat = (f: (i: number) => ItemStyle) => Array.from({ length: COUNT }, (_, i) => f(i))

const WIDTHS = [150, 230, 120, 200, 140, 180]
const HEIGHTS = [140, 300, 210, 400, 170, 260]
const BARS = [640, 980, 420, 1100, 760, 520]

/** The six CSS states the flex scene moves through. Yoga computes every keyframe. */
export const FLEX_STATES: FlexState[] = [
  { container: 'justify-content:flex-start; align-items:center; gap:24px', items: repeat((i) => sq(WIDTHS[i]!, 150)) },
  { container: 'justify-content:space-between; align-items:center', items: repeat((i) => sq(WIDTHS[i]!, 150)) },
  { container: 'justify-content:space-between; align-items:flex-end', items: repeat((i) => sq(WIDTHS[i]!, HEIGHTS[i]!)) },
  { container: 'justify-content:space-evenly; align-items:center', items: repeat(() => sq(150, 150, 75)) },
  {
    container: 'flex-direction:column; justify-content:center; align-items:center; gap:18px',
    items: repeat((i) => sq(BARS[i]!, 62, 31)),
  },
  { container: 'align-items:center; gap:20px', items: repeat(() => ({ grow: true, h: STAGE.h, r: 26 })) },
]

function markup(state: FlexState) {
  const items = state.items
    .map((it, i) => {
      const size = it.grow ? `flex:1; height:${it.h}px` : `width:${it.w}px; height:${it.h}px`
      return `<div id="b${i}" style="${size}; border-radius:${it.r}px; background:#fff"></div>`
    })
    .join('')
  return `<layer width="${W}" height="${H}" background="#000">
  <layer cx="${STAGE.cx}" cy="${STAGE.cy}">
    <div style="display:flex; width:${STAGE.w}px; height:${STAGE.h}px; ${state.container}">${items}</div>
  </layer>
</layer>`
}

export async function computeFlexLayouts(): Promise<Box[][]> {
  const out: Box[][] = []
  for (const state of FLEX_STATES) {
    const report = await checkFvg(markup(state))
    const errors = report.issues.filter((i) => i.level === 'error')
    if (errors.length) throw new Error(`flex layout: ${errors.map((e) => e.message).join('; ')}`)
    out.push(
      state.items.map((it, i) => {
        const el = report.elements.find((e) => e.id === `b${i}`)
        if (!el) throw new Error(`flex layout: b${i} missing from report`)
        return { x: el.box.x, y: el.box.y, w: el.box.width, h: el.box.height, r: it.r }
      }),
    )
  }
  return out
}

export type Cell = { cx: number; cy: number; w: number; h: number }

/**
 * Lays out a centred flex row and returns each cell's box, so the cells can
 * then be animated one by one. `cell(i, id)` must return markup carrying `id`.
 */
export async function measureRow(count: number, cell: (i: number, id: string) => string, cy: number, gap = 0): Promise<Cell[]> {
  const cells = Array.from({ length: count }, (_, i) => cell(i, `c${i}`)).join('')
  const report = await checkFvg(
    `<layer width="${W}" height="${H}" background="#000"><layer cx="${W / 2}" cy="${cy}"><div style="display:flex; gap:${gap}px; align-items:center">${cells}</div></layer></layer>`,
  )
  const errors = report.issues.filter((i) => i.level === 'error')
  if (errors.length) throw new Error(`row layout: ${errors.map((e) => e.message).join('; ')}`)
  return Array.from({ length: count }, (_, i) => {
    const el = report.elements.find((e) => e.id === `c${i}`)
    if (!el) throw new Error(`cell ${i} missing from report`)
    return { cx: el.box.centerX, cy: el.box.centerY, w: el.box.width, h: el.box.height }
  })
}

export type Letter = Cell & { ch: string }

export async function computeLetters(word: string, style: string, cy: number, gap = 0): Promise<Letter[]> {
  const chars = [...word]
  const cells = await measureRow(chars.length, (i, id) => `<p id="${id}" style="${style}">${chars[i]}</p>`, cy, gap)
  return cells.map((c, i) => ({ ...c, ch: chars[i]! }))
}
