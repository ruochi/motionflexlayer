/**
 * 15 秒品牌片「校线」。虚构产品，用来演示品牌片的做法，不是拿去套的模板。
 *
 * 卖点是「偏了的，它对齐。」隐喻是一条红线甩过去，把偏了的按钮卡回格子。
 * 全片只在结尾拉远一次。红线在 14.0 的正拍上再卡一次，收成落幅。
 *
 *   npm run mfl -- brand  examples/brand/index.ts
 *   npm run mfl -- stills examples/brand/index.ts --cues
 *   npm run mfl -- check  examples/brand/index.ts
 *   npm run mfl -- frames examples/brand/index.ts
 */
import {
  createCanvas,
  defineComposition,
  fade,
  fx,
  h,
  mixColor,
  place,
  progress,
  pulse,
  reveal,
  rgba,
  shot,
  spring,
  text,
  tween,
  typewriter,
  wiggle,
  type Child,
  type Frame,
} from 'motionflexlayer'
import { CARD, CHROME, INK, LINE, MUTED, OK, PAPER, TRACK } from './palette.js'
import { score } from './score.js'
import { CHECKS, DUR, H, LINE_TEXT, TYPE_STEP, W, tl } from './timeline.js'

const GRID = mixColor(PAPER, INK, 0.05)

let grain: ReturnType<typeof createCanvas> | undefined

function buildGrain() {
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  let n = 11
  const rnd = () => {
    n = (n + 0x6d2b79f5) >>> 0
    let t = Math.imul(n ^ (n >>> 15), n | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < 8000; i++) {
    ctx.fillStyle = rgba(INK, 0.02 + rnd() * 0.035)
    ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 2, 2)
  }
  return c
}

/** 铺满舞台的一层。子元素用画面坐标，原点在左上角。xShift 做横甩，元素在出画之前就淡没。 */
function group(xShift: number, opacity: number, children: Child[]): Child {
  if (opacity <= 0.002) return null
  return place({ x: W / 2 + xShift, y: H / 2, width: W, height: H, anchor: 'center', opacity }, ...children)
}

function grid(f: Frame) {
  const drift = (f.t * 6) % 64
  const lines: Child[] = []
  for (let x = -64 + drift; x < W; x += 64) {
    lines.push(h('line', { x1: x, y1: 0, x2: x, y2: H, stroke: GRID, 'stroke-width': 1 }))
  }
  for (let y = 32; y < H; y += 64) {
    lines.push(h('line', { x1: 0, y1: y, x2: W, y2: y, stroke: GRID, 'stroke-width': 1 }))
  }
  return lines
}

function page(opts: {
  x: number
  y: number
  w: number
  height: number
  ox: number
  opacity: number
  scale?: number
  bracket?: number
  skeleton?: boolean
  badge?: number
}) {
  const { x, y, w, height, ox, opacity } = opts
  if (opacity <= 0.002) return null
  const bw = Math.min(180, Math.round(w * 0.46))
  const bh = 72
  const bx = w / 2 + ox
  const by = height * 0.66
  const p = opts.bracket ?? 0
  const arm = 26 * p
  const x0 = bx - bw / 2 - 16
  const y0 = by - bh / 2 - 16
  const x1 = bx + bw / 2 + 16
  const y1 = by + bh / 2 + 16
  const badge = opts.badge ?? 0
  const kids: Child[] = [
    h('rect', { x: 0, y: 0, width: w, height, rx: 18, fill: CARD }),
    h('rect', { x: 0, y: 0, width: w, height: 64, fill: CHROME }),
    place({ x: 28, y: 32, anchor: 'left' }, text('购买页', { fontSize: 32, color: PAPER })),
    badge > 0.02
      ? place(
          { x: w - 24, y: 32, anchor: 'right', opacity: Math.min(1, badge) },
          text('已对齐', { fontSize: 32, fontWeight: 700, color: PAPER }),
        )
      : null,
    opts.skeleton ? place({ x: 32, y: 100, anchor: 'left' }, text('夏季短袖', { fontSize: 32, fontWeight: 700, color: INK })) : null,
    opts.skeleton ? place({ x: 32, y: 160, anchor: 'left' }, text('¥128', { fontSize: 32, color: MUTED })) : null,
    opts.skeleton ? h('rect', { x: 32, y: 196, width: w * 0.5, height: 8, rx: 4, fill: TRACK }) : null,
    opts.skeleton ? h('rect', { x: 32, y: 214, width: w * 0.32, height: 8, rx: 4, fill: TRACK }) : null,
    place(
      { x: bx, y: by, width: bw, height: bh, anchor: 'center' },
      h('rect', { x: 0, y: 0, width: bw, height: bh, rx: 10, fill: INK }),
      place({ x: bw / 2, y: bh / 2 }, text('购买', { fontSize: 32, fontWeight: 700, color: PAPER })),
    ),
  ]
  if (p > 0.02) {
    const stroke = { stroke: LINE, 'stroke-width': 4 }
    kids.push(
      h('line', { x1: x0, y1: y0, x2: x0 + arm, y2: y0, ...stroke }),
      h('line', { x1: x0, y1: y0, x2: x0, y2: y0 + arm, ...stroke }),
      h('line', { x1: x1 - arm, y1: y0, x2: x1, y2: y0, ...stroke }),
      h('line', { x1: x1, y1: y0, x2: x1, y2: y0 + arm, ...stroke }),
      h('line', { x1: x0, y1: y1 - arm, x2: x0, y2: y1, ...stroke }),
      h('line', { x1: x0, y1: y1, x2: x0 + arm, y2: y1, ...stroke }),
      h('line', { x1: x1, y1: y1 - arm, x2: x1, y2: y1, ...stroke }),
      h('line', { x1: x1 - arm, y1: y1, x2: x1, y2: y1, ...stroke }),
    )
  }
  return place({ x, y, width: w, height, opacity, scale: opts.scale, anchor: 'center' }, ...kids)
}

function offsetAt(t: number): number {
  const at = tl.at('snap')
  if (t < at) return 64
  return 64 * (1 - spring(t - at, { damping: 11, stiffness: 170 }))
}

function pxText(t: number): string {
  const at = tl.at('snap')
  if (t < at) return '12'
  const left = 12 * (1 - spring(t - at, { damping: 14, stiffness: 180 }))
  return String(Math.max(0, Math.round(left)))
}

function act1(f: Frame): Child {
  const a = fade(f.t, 0.04, 2.9, 0.12, 0.18)
  const head = progress(f.t, tl.at('headline'), tl.at('headline') + 0.5, 'outCubic')
  const shown = (f.t - tl.at('type')) / TYPE_STEP
  const pop = spring(f.t - tl.at('send'), { damping: 9, stiffness: 220 })
  return group(0, a, [
    place(
      { x: 150, y: 170, anchor: 'left', opacity: fade(f.t, tl.at('kicker'), 2.85, 0.18, 0.15) },
      text('校线', { fontSize: 32, fontWeight: 700, color: MUTED, letterSpacing: 8 }),
    ),
    place(
      { x: 150, y: 300, anchor: 'left', opacity: head > 0 ? 1 : 0 },
      reveal(
        { progress: head, width: 760, height: 140 },
        place({ x: 380, y: 70 }, text('按钮偏了', { fontSize: 104, fontWeight: 800, color: INK })),
      ),
    ),
    place(
      { x: 150, y: 470, anchor: 'left', opacity: fade(f.t, tl.at('type') - 0.04, 2.85, 0.1, 0.15) },
      typewriter(LINE_TEXT, shown, { fontSize: 36, color: INK }),
    ),
    place(
      { x: 640, y: 470, scale: 0.92 + 0.08 * Math.min(1, Math.max(0, pop)), opacity: pop > 0.02 ? Math.min(1, pop) : 0 },
      h('circle', { cx: 0, cy: 0, r: 10, fill: LINE }),
    ),
    page({
      x: 1360,
      y: 640,
      w: 680,
      height: 500,
      ox: 64,
      opacity: fade(f.t, tl.at('frameIn'), 2.9, 0.22, 0.16),
      bracket: progress(f.t, tl.at('bracket'), tl.at('bracket') + 0.35, 'outCubic'),
      skeleton: true,
    }),
  ])
}

function act2(f: Frame): Child {
  const a = fade(f.t, 3.02, 5.88, 0.14, 0.16)
  const whip = tween(f.t, tl.at('whip'), 5.98, 0, -36, 'inCubic')
  const rows: Child[] = []
  CHECKS.forEach((label, i) => {
    const at = tl.times('row')[i] ?? 3.25
    const local = f.t - at
    if (local <= 0) return
    const y = 250 + i * 140
    const bar = progress(f.t, at, at + 0.3, 'outCubic')
    const done = local > 0.26
    const op = progress(local, 0, 0.1)
    rows.push(
      place({ x: 640, y, anchor: 'left', opacity: op }, text(label, { fontSize: 36, fontWeight: 700, color: INK })),
      place(
        { x: 860, y, anchor: 'left', opacity: op },
        h('rect', { x: 0, y: -9, width: 520, height: 18, rx: 9, fill: TRACK }),
        h('rect', { x: 0, y: -9, width: Math.max(2, 520 * bar), height: 18, rx: 9, fill: done ? OK : LINE }),
      ),
      place(
        { x: 1460, y, anchor: 'left', opacity: done ? progress(f.t, at + 0.26, at + 0.4) : 0 },
        text('通过', { fontSize: 32, fontWeight: 700, color: OK }),
      ),
    )
  })
  return group(whip, a, [
    place(
      { x: 160, y: 150, anchor: 'left', opacity: progress(f.t, tl.at('dock'), tl.at('dock') + 0.2) },
      text('五项都要过', { fontSize: 64, fontWeight: 800, color: INK }),
    ),
    page({
      x: 300,
      y: 720,
      w: 420,
      height: 320,
      ox: 28,
      opacity: progress(f.t, tl.at('dock'), tl.at('dock') + 0.25),
      bracket: 1,
    }),
    ...rows,
  ])
}

function act3(f: Frame): Child {
  const a = fade(f.t, 6.06, 9.38, 0.14, 0.18)
  const enter = tween(f.t, 6.06, 6.42, 70, 0, 'outExpo')
  const ox = offsetAt(f.t)
  const pageX = 1040
  const pageY = 660
  const pageH = 520
  const buttonY = pageY - pageH / 2 + pageH * 0.66
  const draw = progress(f.t, tl.at('line'), tl.at('line') + 0.65, 'inOutCubic')
  const stop = pageX + ox - 150
  const x2 = 200 + Math.min(draw * 760, Math.max(0, stop - 200))
  return group(enter, a, [
    place(
      { x: 150, y: 160, anchor: 'left', opacity: progress(f.t, tl.at('act3'), tl.at('act3') + 0.22, 'outCubic') },
      text('卡回格子', { fontSize: 72, fontWeight: 800, color: INK }),
    ),
    place(
      { x: 1720, y: 170, anchor: 'right', opacity: fade(f.t, tl.at('count'), 9.3, 0.12, 0.18) },
      text(pxText(f.t), { fontSize: 96, fontWeight: 800, color: LINE }),
    ),
    page({
      x: pageX,
      y: pageY,
      w: 820,
      height: pageH,
      ox,
      opacity: progress(f.t, 6.12, 6.4, 'outCubic'),
      bracket: f.t < tl.at('snap') ? 1 : 1 - progress(f.t, tl.at('snap'), tl.at('snap') + 0.28),
      skeleton: true,
    }),
    draw > 0.02 && x2 > 210
      ? h('line', { x1: 200, y1: buttonY, x2, y2: buttonY, stroke: LINE, 'stroke-width': 6 })
      : null,
  ])
}

function act4(f: Frame): Child {
  const a = fade(f.t, 9.52, 12.42, 0.12, 0.18)
  const badge = progress(f.t, tl.at('badge'), tl.at('badge') + 0.28, 'outBack')
  const specs = [
    { label: '手机', at: tl.at('phone'), x: 430, y: 660, w: 360, h: 480, enter: 'up' as const },
    { label: '网页', at: tl.at('web'), x: 980, y: 690, w: 500, h: 440, enter: 'pop' as const },
    { label: '幻灯片', at: tl.at('slide'), x: 1510, y: 670, w: 400, h: 460, enter: 'slide' as const },
  ]
  const nodes: Child[] = [
    place(
      { x: 150, y: 150, anchor: 'left', opacity: progress(f.t, tl.at('act4'), tl.at('act4') + 0.22, 'outCubic') },
      text('三处一起齐', { fontSize: 64, fontWeight: 800, color: INK }),
    ),
  ]
  for (const s of specs) {
    const local = f.t - s.at
    if (local <= 0) continue
    const e = spring(local, { damping: s.enter === 'pop' ? 10 : 15, stiffness: 150 })
    const clamped = Math.min(1, Math.max(0, e))
    const dy = s.enter === 'up' ? (1 - clamped) * 48 : 0
    const dx = s.enter === 'slide' ? (1 - clamped) * 56 : 0
    const scale = s.enter === 'pop' ? 0.92 + 0.08 * clamped : 1
    const op = progress(local, 0, 0.14)
    nodes.push(
      place(
        { x: s.x, y: s.y - s.h / 2 - 56 + dy, anchor: 'center', opacity: op },
        text(s.label, { fontSize: 32, fontWeight: 700, color: INK }),
      ),
      page({
        x: s.x + dx,
        y: s.y + dy,
        w: s.w,
        height: s.h,
        ox: 0,
        opacity: op,
        scale,
        skeleton: true,
        badge,
      }),
    )
  }
  return group(0, a, nodes)
}

/** 和 logo.svg 同一套几何：两道灰线，底下那道还差一截红。 */
function mark() {
  return h(
    'g',
    {},
    h('rect', { x: 0, y: 0, width: 160, height: 160, rx: 24, fill: INK }),
    h('line', { x1: 40, y1: 64, x2: 120, y2: 64, stroke: PAPER, 'stroke-width': 8 }),
    h('line', { x1: 40, y1: 100, x2: 84, y2: 100, stroke: PAPER, 'stroke-width': 8 }),
    h('line', { x1: 96, y1: 100, x2: 124, y2: 100, stroke: LINE, 'stroke-width': 8 }),
  )
}

function act5(f: Frame): Child {
  const a = fade(f.t, 12.52, 15.3, 0.16, 0.4)
  const p = progress(f.t, tl.at('collapse'), 13.15, 'inCubic')
  const travel = Math.min(p, 0.45) / 0.45
  const gone = progress(p, 0.2, 0.72)
  const logoE = Math.min(1, Math.max(0, spring(f.t - tl.at('logo'), { damping: 14, stiffness: 140 })))
  const rule = progress(f.t, tl.at('rule'), tl.at('rule') + 0.26, 'inQuart')
  const fading: Child[] = [520, 960, 1400].map((x) =>
    page({
      x: x + (960 - x) * travel * 0.28,
      y: 640,
      w: 300,
      height: 220,
      ox: 0,
      opacity: f.t < tl.at('logo') ? 1 - gone : 0,
      scale: 1 - 0.12 * travel,
    }),
  )
  return group(0, a, [
    ...fading,
    place(
      { x: 960, y: 300, anchor: 'center', opacity: progress(f.t, tl.at('logo'), tl.at('logo') + 0.18), scale: 0.94 + 0.06 * logoE },
      mark(),
    ),
    place(
      { x: 960, y: 500, opacity: progress(f.t, tl.at('name'), tl.at('name') + 0.2, 'outCubic') },
      text('校线', { fontSize: 112, fontWeight: 800, color: INK }),
    ),
    place(
      { x: 960, y: 630, opacity: progress(f.t, tl.at('slogan'), tl.at('slogan') + 0.22, 'outCubic') },
      text('偏了的，它对齐。', { fontSize: 40, color: INK }),
    ),
    rule > 0.02
      ? h('line', {
          x1: 960 - 260 * rule,
          y1: 700,
          x2: 960 + 260 * rule,
          y2: 700,
          stroke: LINE,
          'stroke-width': 6,
        })
      : null,
    page({
      x: 960,
      y: 860,
      w: 320,
      height: 200,
      ox: 0,
      opacity: fade(f.t, tl.at('cta'), 15.2, 0.16, 0.3),
    }),
  ])
}

function camera(f: Frame) {
  const t = f.t
  let zoom = 1
  let y = H / 2
  if (t < 3) zoom = tween(t, 0.1, 2.5, 1.035, 1, 'outCubic')
  else if (t < 9.5 && t >= 6) {
    zoom = tween(t, 6.2, 9.1, 1, 1.045, 'inOutSine')
    y = tween(t, 6.2, 8.6, H / 2, H / 2 - 12, 'inOutSine')
  } else if (t >= 9.5 && t < 12.5) zoom = tween(t, 9.55, 11.6, 0.985, 1, 'outCubic')
  else if (t >= 12.5) zoom = tween(t, 12.6, 14.7, 1.05, 1, 'outCubic')
  const hit = pulse(t, [tl.at('snap')], 7)
  return shot({
    width: W,
    height: H,
    x: W / 2,
    y,
    zoom,
    shakeX: wiggle(t, 21, 10 * hit, 2),
    shakeY: wiggle(t, 19, 7 * hit, 5),
  })
}

export default defineComposition({
  id: 'brand',
  width: W,
  height: H,
  fps: 30,
  duration: DUR,
  background: PAPER,
  color: INK,
  timeline: tl,
  setup: () => {
    grain = buildGrain()
  },
  render: (f) => {
    const cam = camera(f)
    const texture =
      grain &&
      fx({ width: W, height: H, name: 'grain' }, (ctx) => {
        ctx.drawImage(grain as unknown as Parameters<typeof ctx.drawImage>[0], 0, 0)
      })
    return [h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, ...grid(f), act1(f), act2(f), act3(f), act4(f), act5(f))), texture]
  },
  audio: {
    clips: [{ src: score, at: 0, gain: -1, fadeIn: 0.15, fadeOut: 0.5, bus: 'music' }],
    master: { lufs: -14, ceiling: -1, fadeOut: 0.35 },
  },
})
