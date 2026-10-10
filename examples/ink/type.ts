/**
 * 片头到描边：同一组字形贯穿四段。
 *
 *   片头    “着墨”两个书法字一笔一笔写出来，盖章。
 *   字落位  它们缩小、换成楷体，落进段落里自己的格子；其余的字从四周飞进来，按阅读顺序落位。
 *   重排    拖动右边线，栏宽每一帧都重新排版，字滑到新位置；然后整段改成竖排。
 *   描边    “着”“墨”“处”三个字留下，其余落下。三个字靠拢，描边合成一圈，最后描边漫开铺满画面。
 *
 * 每个字的位置都只由 t 算出：先求它在各个版面里的格子，再按时间在这些格子之间插值。
 */
import { canvas, glyph, h, type Glyph, type PlacedLine } from 'flexlayer'
import {
  clamp,
  edgeRoom,
  fade,
  fx,
  glyphBounds,
  hash,
  lerp,
  mixColor,
  pathLength,
  place,
  placeGlyph,
  progress,
  pulse,
  rgba,
  spring,
  text,
  tween,
  unionBounds,
  wiggle,
  type Child,
  type Frame,
} from 'motionflexlayer'
import { at, H, L, offCanvas, seal, sheet, W } from './kit.js'
import { C, LATIN } from './look.js'

export const P = '先排版，再拆字。每个字都知道自己落在哪一行、哪一格。笔画着墨之处，就是它该在的地方。'
const CHARS = [...P]
const SIZE = 64
const SHAPES = await glyph(P, { font: 'Kai', size: SIZE, weight: 700 })
const TITLE = await glyph('着墨', { font: 'Brush', size: 360 })
const TITLE_LEN = TITLE.map((g) => pathLength(g.d))
const PAPER = { fill: C.paper }
/** 竖排时要从字身左下挪到格子右上的句读。 */
const PUNCT = '，。、；：？！'

// ---------------------------------------------------------------- 版面

type Slot = { x: number; y: number; line: number }
type Layout = { slots: Slot[]; width: number; height: number; lines: PlacedLine[] }

/** 交给 flexlayer 排一遍，取回每个字的格子（字身中心，相对版面左上角）。 */
function typeset(style: string, vertical = false): Layout {
  const made = canvas.create(h('layer', {}, h('p', { style: `font-family:Kai; font-weight:700; font-size:${SIZE}px; ${style}` }, P)))
  const lines = made.text[0]!.lines
  const slots: Slot[] = []
  // 竖排时 lines 是一格一项，同一列的 x 相同；按 x 数出第几列
  const columns: number[] = []
  lines.forEach((line, li) => {
    for (const ch of line.chars) {
      const i = slots.length
      if (CHARS[i] !== ch.text) throw new Error(`排版结果和原文对不上：第 ${i} 个字是“${ch.text}”`)
      const g = SHAPES[i]!
      if (!vertical) {
        slots.push({ x: ch.x + g.width / 2, y: line.baseline - g.baseline + g.height / 2, line: li })
        continue
      }
      if (columns.at(-1) !== ch.x) columns.push(ch.x)
      // 句读的字形在字身左下，竖排要挪到格子右上
      const p = PUNCT.includes(ch.text) ? SIZE * 0.5 : 0
      slots.push({ x: ch.x + ch.width / 2 + p, y: line.y + line.height / 2 - p, line: columns.length - 1 })
    }
  })
  if (slots.length !== CHARS.length) throw new Error('排版丢了字')
  return { slots, width: made.width, height: made.height, lines }
}

const WIDE = 1200
const NARROW = 780
const horizontal = (w: number) => typeset(`width:${w}px; line-height:1.6`)
const A = horizontal(WIDE)
const B = horizontal(NARROW)
const V = typeset('height:520px; writing-mode:vertical-rl; letter-spacing:6px', true)

const CY = 500
const A_O = { x: (W - WIDE) / 2, y: CY - A.height / 2 }
const V_O = { x: (W - V.width) / 2, y: CY - V.height / 2 }

/** 拖动中的每个整数宽度只排一次。 */
const live = new Map<number, Layout>()
function layoutAt(width: number): Layout {
  const w = Math.round(width)
  let l = live.get(w)
  if (!l) {
    l = horizontal(w)
    live.set(w, l)
  }
  return l
}

// ---------------------------------------------------------------- 时间点（都卡在旁白的词上）

const T_SEAL = at('intro', '镜头') + 0.05
const T_TITLE_FLY = at('glyphs', '排版') - 0.75
const T_GRID = at('glyphs', '文字')
const T_RAIN = at('glyphs', '拆')
const T_ROW = at('glyphs', '行')
const T_CELL = at('glyphs', '格')
const T_DRAG = at('reflow', '栏')
const DRAG_LEN = 1.3
const T_VERT = at('reflow', '竖') - 0.1
const T_LIFT = L.stroke.from + 0.05
const T_STROKE1 = at('stroke', '描')
const T_STROKE2 = at('stroke', '墨迹')
const T_MERGE = at('stroke', '叠') - 0.2
export const T_POP = at('stroke', '圈')
export const T_FLOOD = L.stroke.to - 0.9

const TITLE_IDX = [P.indexOf('着'), P.indexOf('墨')]
const STICK_IDX = [P.indexOf('着'), P.indexOf('墨'), P.indexOf('处')]
const TITLE_X = [W / 2 - 200, W / 2 + 200]
const TITLE_Y = 440

/** 其余的字按阅读顺序飞进来。 */
const rainOrder = new Map<number, number>()
CHARS.forEach((_, i) => {
  if (!TITLE_IDX.includes(i)) rainOrder.set(i, rainOrder.size)
})
export const rainStart = (i: number) => T_RAIN + rainOrder.get(i)! * 0.035
export const RAIN_LANDINGS = [...rainOrder.keys()].map((i) => rainStart(i) + 0.3)
export const VERT_STARTS = CHARS.map((_, i) => T_VERT + i * 0.018)
export { T_SEAL, T_TITLE_FLY, T_DRAG, T_VERT, T_MERGE, T_CELL }

// ---------------------------------------------------------------- 每个字的位置

type Pose = { x: number; y: number; scale: number; rotate: number; opacity: number }

const at2 = (o: { x: number; y: number }, s: Slot) => ({ x: o.x + s.x, y: o.y + s.y })

/** 拖动栏宽时的位置：取最近 0.36 秒里各个版面给出的格子，按 Hann 窗加权。断行一变，字滑过去而不是跳过去。 */
function reflowSpot(i: number, t: number) {
  const lag = i * 0.01
  let x = 0
  let y = 0
  let sum = 0
  const N = 9
  for (let j = 0; j < N; j++) {
    const tau = t - lag - j * 0.045
    const w = Math.sin((Math.PI * (j + 0.5)) / N)
    const s = layoutAt(tween(tau, T_DRAG, T_DRAG + DRAG_LEN, WIDE, NARROW, 'inOutCubic')).slots[i]!
    x += w * s.x
    y += w * s.y
    sum += w
  }
  return { x: A_O.x + x / sum, y: A_O.y + y / sum }
}

/** 两点之间走一条弧线：k 是进度，bend 是弧顶偏离直线的像素。 */
function arc(a: { x: number; y: number }, b: { x: number; y: number }, k: number, bend: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const off = Math.sin(Math.PI * clamp(k)) * bend
  return { x: a.x + dx * k - (dy / len) * off, y: a.y + dy * k + (dx / len) * off }
}

/** 第 i 个字从开场到描边前的位置。 */
function paragraphPose(i: number, t: number): Pose {
  let p: { x: number; y: number }
  let scale = 1
  let rotate = 0
  let opacity = 1
  if (t < T_DRAG && TITLE_IDX.includes(i)) p = at2(A_O, A.slots[i]!)
  else if (t < T_DRAG) {
    const slot = at2(A_O, A.slots[i]!)
    const s0 = rainStart(i)
    const k = spring(t - s0, { damping: 15, stiffness: 120 })
    const ang = hash(i, 1) * Math.PI * 2
    const dist = 620 + hash(i, 2) * 360
    const from = { x: slot.x + Math.cos(ang) * dist, y: slot.y + Math.sin(ang) * dist }
    p = arc(from, slot, k, (hash(i, 4) - 0.5) * 240)
    rotate = (hash(i, 3) - 0.5) * 220 * (1 - k)
    scale = lerp(1.9, 1, k)
    opacity = progress(t, s0, s0 + 0.12)
  } else p = reflowSpot(i, t)
  if (t > T_VERT) {
    const k = spring(t - VERT_STARTS[i]!, { damping: 17, stiffness: 95 })
    p = arc(p, at2(V_O, V.slots[i]!), k, 70)
    rotate += 14 * Math.sin(Math.PI * clamp(k))
  }
  return { ...p, scale, rotate, opacity }
}

// ---------------------------------------------------------------- 片头

function titleChar(i: number, t: number): Child[] {
  const g = TITLE[i]!
  const t0 = 0.45 + i * 0.6
  const dash = TITLE_LEN[i]! * progress(t, t0, t0 + 1.5, 'outQuad')
  if (dash <= 0) return []
  const fill = progress(t, t0 + 1.0, t0 + 1.7, 'outCubic')
  const hit = pulse(t, [T_SEAL + 0.16], 9)
  const x = TITLE_X[i]! + wiggle(t, 26, 7 * hit, i)
  const y = TITLE_Y + wiggle(t, 26, 7 * hit, i + 5)
  if (t >= T_TITLE_FLY) return []
  return [
    placeGlyph(
      g,
      { x, y },
      {
        fill: rgba(C.paper, fill),
        stroke: rgba(C.paper, 1 - 0.9 * fill),
        'stroke-width': 3,
        'stroke-dasharray': `${dash.toFixed(1)} ${(TITLE_LEN[i]! + 10).toFixed(0)}`,
      },
    ),
  ]
}

/** 书法字飞进段落：位置走弧线，字号从 360 缩到 64，中途从书法换成楷体。 */
function titleFlight(n: number, t: number): Child[] {
  const i = TITLE_IDX[n]!
  const k = progress(t, T_TITLE_FLY + n * 0.12, T_TITLE_FLY + n * 0.12 + 0.95, 'inOutCubic')
  const from = { x: TITLE_X[n]!, y: TITLE_Y }
  const to = at2(A_O, A.slots[i]!)
  const p = arc(from, to, k, n ? -120 : 120)
  const size = lerp(360, SIZE, k)
  const q = progress(k, 0.35, 0.75)
  const rotate = (n ? 10 : -10) * Math.sin(Math.PI * k)
  return [
    placeGlyph(TITLE[n]!, { ...p, scale: size / 360, rotate, opacity: 1 - q }, PAPER),
    placeGlyph(SHAPES[i]!, { ...p, scale: size / SIZE, rotate, opacity: q }, PAPER),
  ]
}

function intro(f: Frame): Child[] {
  const t = f.t
  if (t > L.glyphs.from + 1) return []
  const out: Child[] = []
  if (t < T_TITLE_FLY + 0.2) out.push(sheet({ id: 'title', glow: `26 ${rgba(C.paper, 0.25 * progress(t, 1.2, 2.6) * (1 - progress(t, 3, 5)))}` }, ...titleChar(0, t), ...titleChar(1, t)))
  const k = progress(t, T_SEAL, T_SEAL + 0.16, 'inQuad')
  const settle = 1 - 0.05 * Math.sin(Math.PI * progress(t, T_SEAL + 0.16, T_SEAL + 0.36))
  // 书法字起飞前，印章转着缩回去
  const away = progress(t, T_TITLE_FLY - 0.3, T_TITLE_FLY + 0.15, 'inBack')
  out.push(seal(TITLE_X[1]! + 250, TITLE_Y + 150, k * settle, -6, away))
  const tag = fade(t, 4.1, L.intro.to - 0.1, 0.6, 0.4)
  out.push(place({ x: W / 2, y: 700 + 20 * (1 - tag), opacity: tag }, text('九个镜头，每一帧都由 flexlayer 排版、绘制', { fontSize: 46, color: C.dim, letterSpacing: '0.04em' })))
  return out
}

// ---------------------------------------------------------------- 字落位：田字格

/** 每个字的格子画成田字格。先于字出现，字落进去时格子闪一下。 */
function grid(f: Frame): Child {
  const t = f.t
  const a = fade(t, T_GRID, T_DRAG + 0.3, 0.2, 0.5)
  if (a <= 0) return null
  return fx({ width: W, height: H, name: 'grid' }, (ctx) => {
    ctx.globalAlpha = a
    const row = A.slots[P.indexOf('行')]!.line
    const rowOn = fade(t, T_ROW - 0.05, T_ROW + 1.4, 0.15, 0.5)
    if (rowOn > 0) {
      const ln = A.lines[row]!
      ctx.fillStyle = rgba(C.red, 0.14 * rowOn)
      ctx.fillRect(A_O.x + ln.x - 16, A_O.y + ln.y, ln.width + 32, ln.height)
    }
    const cell = P.indexOf('格')
    A.slots.forEach((s, i) => {
      const on = progress(t, T_GRID + i * 0.018, T_GRID + i * 0.018 + 0.25, 'outCubic')
      if (on <= 0) return
      const landed = TITLE_IDX.includes(i) ? T_TITLE_FLY + TITLE_IDX.indexOf(i) * 0.12 + 0.95 : rainStart(i) + 0.3
      const flash = pulse(t, [landed], 6)
      const hot = i === cell ? fade(t, T_CELL - 0.05, T_CELL + 1.3, 0.1, 0.4) : 0
      const half = (SIZE / 2 + 4) * (0.6 + 0.4 * on) * (1 + 0.25 * hot)
      const x = A_O.x + s.x
      const y = A_O.y + s.y
      ctx.strokeStyle = rgba(hot > 0 ? C.red : C.paper, 0.16 + 0.3 * flash + 0.8 * hot)
      ctx.lineWidth = hot > 0 ? 3 : 1.5
      ctx.setLineDash([])
      ctx.strokeRect(x - half, y - half, half * 2, half * 2)
      ctx.setLineDash([4, 6])
      ctx.lineWidth = 1
      ctx.strokeStyle = rgba(C.red, 0.28 + 0.4 * flash)
      ctx.beginPath()
      ctx.moveTo(x - half, y)
      ctx.lineTo(x + half, y)
      ctx.moveTo(x, y - half)
      ctx.lineTo(x, y + half)
      ctx.stroke()
    })
  })
}

// ---------------------------------------------------------------- 重排：拖动右边线

function guide(f: Frame): Child[] {
  const t = f.t
  const a = fade(t, L.reflow.from + 0.05, T_VERT + 0.3, 0.3, 0.3)
  if (a <= 0) return []
  const w = tween(t, T_DRAG, T_DRAG + DRAG_LEN, WIDE, NARROW, 'inOutCubic')
  const x = A_O.x + w
  const top = A_O.y - 50
  const bottom = A_O.y + B.height + 50
  const grab = fade(t, T_DRAG - 0.2, T_DRAG + DRAG_LEN + 0.1, 0.15, 0.25)
  return [
    fx({ width: W, height: H, name: 'guide' }, (ctx) => {
      ctx.globalAlpha = a
      ctx.strokeStyle = C.red
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      ctx.fillStyle = C.red
      ctx.beginPath()
      ctx.arc(x, (top + bottom) / 2, 9 + 5 * grab, 0, Math.PI * 2)
      ctx.fill()
    }),
    place({ x: x + 28, y: top - 6, anchor: 'bottom-left', opacity: a }, text(`${Math.round(w)} px`, { fontFamily: LATIN, fontSize: 44, color: C.red })),
  ]
}

// ---------------------------------------------------------------- 描边

/** 三个字先分开、再撞在一起。描边按合起来的墨迹算，碰到就连成一圈。 */
function stickerPose(n: number, t: number): Pose {
  const i = STICK_IDX[n]!
  const v = at2(V_O, V.slots[i]!)
  const big = 4.5
  const spread = { x: W / 2 + (n - 1) * 330, y: CY, rotate: [-6, 3, 8][n]! }
  const merged = { x: W / 2 + (n - 1) * 205, y: CY + [14, -16, 10][n]!, rotate: [-11, 3, 12][n]! }
  const k1 = spring(t - T_LIFT - 0.15 - n * 0.07, { damping: 14, stiffness: 85 })
  const k2 = spring(t - T_MERGE - n * 0.04, { damping: 9, stiffness: 170 })
  return {
    x: lerp(lerp(v.x, spread.x, k1), merged.x, k2),
    y: lerp(lerp(v.y, spread.y, k1), merged.y, k2),
    scale: lerp(1, big, k1),
    rotate: lerp(lerp(0, spread.rotate, k1), merged.rotate, k2),
    opacity: 1,
  }
}

/** 其余的字落下：重力、侧漂、自转，0.6 秒内淡出。 */
function fallPose(i: number, t: number): Pose | null {
  const base = paragraphPose(i, T_LIFT)
  const d = t - T_LIFT - hash(i, 7) * 0.35
  if (d <= 0) return base
  const opacity = 1 - progress(d, 0.15, 0.6)
  if (opacity <= 0) return null
  return {
    x: base.x + (hash(i, 8) - 0.5) * 260 * d,
    y: base.y + 0.5 * 2600 * d * d - 120 * d,
    rotate: (hash(i, 9) - 0.5) * 320 * d,
    scale: 1,
    opacity,
  }
}

function sticker(f: Frame): Child[] {
  const t = f.t
  if (t < T_LIFT || t > L.glass.from + 0.6) return []
  const w1 = 12 * Math.max(0, spring(t - T_STROKE1, { damping: 12, stiffness: 140 }))
  const w2 = w1 + 16 * Math.max(0, spring(t - T_STROKE2, { damping: 12, stiffness: 140 })) + 1500 * progress(t, T_FLOOD, L.stroke.to + 0.05, 'inCubic')
  const strokeAttr = w1 < 0.3 ? undefined : w2 - w1 < 0.3 ? `${w1.toFixed(1)} ${C.paper}` : `${w1.toFixed(1)} ${C.paper}, ${w2.toFixed(1)} ${C.red}`
  const fill = mixColor(C.paper, C.night, clamp(w1 / 12))
  const bump = pulse(t, [T_POP], 7, 0.05)
  const lift = progress(t, T_POP, T_POP + 0.4, 'outCubic')
  const flooding = t > T_FLOOD - 0.05
  const stickInk = unionBounds(...STICK_IDX.map((i, n) => glyphBounds(SHAPES[i]!, stickerPose(n, t))))
  const fall: Child[] = []
  let out = false
  CHARS.forEach((_, i) => {
    if (STICK_IDX.includes(i)) return
    const p = fallPose(i, t)
    if (!p) return
    fall.push(placeGlyph(SHAPES[i]!, p, PAPER))
    out ||= offCanvas(p)
  })
  return [
    sheet({ id: 'falling', expect: out ? 'overflow-canvas: 落出画面的字' : undefined }, ...fall),
    sheet(
      {
        id: 'sticker',
        'ink-stroke': strokeAttr,
        shadow: lift > 0 && !flooding ? `0 ${(8 + 18 * lift).toFixed(1)} ${(20 + 30 * lift).toFixed(1)} #000000aa` : undefined,
        scale: bump > 0.001 ? 1 + 0.08 * bump : undefined,
        origin: `${W / 2} ${CY}`,
        opacity: 1 - progress(t, L.glass.from + 0.2, L.glass.from + 0.6),
        expect: w2 > edgeRoom(stickInk, W, H) ? 'effect-clipped: 描边漫出画面做转场' : undefined,
      },
      ...STICK_IDX.map((i, n) => placeGlyph(SHAPES[i]!, stickerPose(n, t), { fill })),
    ),
  ]
}

// ---------------------------------------------------------------- 合起来

function paragraph(f: Frame): Child {
  const t = f.t
  if (t < T_TITLE_FLY || t >= T_LIFT) return null
  const out: Child[] = []
  let off = false
  CHARS.forEach((_, i) => {
    const n = TITLE_IDX.indexOf(i)
    if (n >= 0 && t < T_TITLE_FLY + n * 0.12 + 0.95) out.push(...titleFlight(n, t))
    else if (n < 0 && t < rainStart(i)) return
    else {
      const p = paragraphPose(i, t)
      out.push(placeGlyph(SHAPES[i]!, p, PAPER))
      off ||= offCanvas(p)
    }
  })
  return sheet({ id: 'paragraph', expect: off ? 'overflow-canvas: 字从画外飞进来' : undefined }, ...out)
}

export function typeScenes(f: Frame): Child[] {
  return [...intro(f), grid(f), paragraph(f), ...guide(f), ...sticker(f)]
}
