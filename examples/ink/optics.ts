/**
 * 玻璃和立体字。
 *
 *   玻璃  描边漫开后是一片朱红，四行大字来回走。一块胶囊形的玻璃滑进来，折射只发生在边缘；
 *         说到“透镜”时它收成圆片，说到“文字”时圆片落下，换成两个玻璃字升上来。
 *   立体  同一个“墨”字从平面挤出厚度，转过来露出侧面；金色小球从字后面滚过，
 *         字跳起来时影子和字分开。最后字转回正面、缩回平面，停在画面正中，交给下一段的镜头。
 */
import { canvas, glyph, h } from 'flexlayer'
import { expects, fade, keyframes, lerp, place, poseBounds, progress, spring, text, type Child, type Frame } from 'motionflexlayer'
import { at, H, L, sheet, W } from './kit.js'
import { C, LATIN } from './look.js'

// ---------------------------------------------------------------- 玻璃

export const T_PILL = at('glass', '玻璃')
const T_EDGE = at('glass', '边缘')
export const T_LENS = at('glass', '透镜')
export const T_GLASS_TEXT = at('glass', '文字')

const ROW_FONT = 'font-weight:800; font-size:180px; letter-spacing:0.02em'
const ROW_TEXT = '排版 · 字形 · 着墨 · 折射 · '
const ROW_W = canvas.create(h('layer', {}, h('p', { style: `white-space:nowrap; ${ROW_FONT}` }, ROW_TEXT))).width
const ROWS = [
  { y: 130, color: C.night, speed: -95 },
  { y: 360, color: C.paper, speed: 120 },
  { y: 590, color: C.night, speed: -80 },
  { y: 820, color: C.paper, speed: 105 },
]

/** 跑马灯：每行三份文字首尾相接，按速度平移，走完一份宽度就绕回来。 */
function rows(t: number): Child {
  const t0 = L.glass.from - 0.1
  return sheet(
    { id: 'marquee', expect: 'overflow-canvas: 跑马灯出画; outside-safe: 跑马灯出画; text-overlap: 跑马灯是背景，标签和玻璃字压在上面' },
    ...ROWS.map((r, i) => {
      const enter = progress(t, t0 + i * 0.08, t0 + i * 0.08 + 0.9, 'outExpo')
      const side = r.speed > 0 ? -1 : 1
      const shift = ((((t - t0) * r.speed) % ROW_W) + ROW_W) % ROW_W
      const x = -ROW_W + shift + side * (1 - enter) * W
      return h('layer', { x: x.toFixed(1), y: r.y, anchor: 'left' }, h('p', { style: `white-space:nowrap; ${ROW_FONT}; color:${r.color}` }, ROW_TEXT.repeat(3)))
    }),
  )
}

/** 胶囊：滑入、漂移，说到“透镜”收成圆片，说到“文字”落下去。 */
function lens(t: number): Child {
  if (t < T_PILL - 0.1 || t > T_GLASS_TEXT + 0.8) return null
  const k = spring(t - T_PILL, { damping: 16, stiffness: 55 })
  const round = spring(t - T_LENS, { damping: 13, stiffness: 120 })
  const drop = progress(t, T_GLASS_TEXT - 0.35, T_GLASS_TEXT + 0.45, 'inBack')
  const breathe = 1 + 0.025 * Math.sin((t - T_EDGE) * 3) * fade(t, T_EDGE, T_LENS, 0.3, 0.3)
  const w = lerp(820, 340, round) * breathe
  const hgt = lerp(300, 340, round) * breathe
  const cx = lerp(-520, W / 2, k) + 70 * Math.sin((t - T_PILL) * 0.7) + 260 * Math.sin((t - T_LENS) * 1.3) * round
  const cy = H / 2 - 20 + 26 * Math.sin((t - T_PILL) * 1.1) + drop * 900
  const off = cx - w / 2 < 0 || cy + hgt / 2 > H
  return sheet(
    { id: 'lens', expect: off ? 'overflow-canvas: 玻璃从画外滑进来、落出画外' : undefined },
    h('rect', {
      x: (cx - w / 2).toFixed(1),
      y: (cy - hgt / 2).toFixed(1),
      width: w.toFixed(1),
      height: hgt.toFixed(1),
      rx: (hgt / 2).toFixed(1),
      fill: '#ffffff0d',
      glass: 'clear',
      shadow: '0 30 60 #00000055',
    }),
  )
}

const GLASS_TEXT = h('p', { style: 'white-space:nowrap; font-size:470px; font-weight:800; color:#ffffff10; glass:clear; shadow:0 24 48 #00000055' }, '着墨')
/** 玻璃字的着墨，相对字的中心。阴影在报告的 effect 框里四周各外扩约 50px。 */
const GLASS_INK = (() => {
  const made = canvas.create(h('layer', {}, GLASS_TEXT))
  const ink = made.elements[0]!.ink
  return { left: ink.left - made.width / 2, top: ink.top - made.height / 2, right: ink.right - made.width / 2, bottom: ink.bottom - made.height / 2 }
})()
const GLASS_SHADOW = 50

function glassText(t: number): Child {
  const k = spring(t - T_GLASS_TEXT + 0.15, { damping: 13, stiffness: 70 })
  if (k <= 0) return null
  const float = t - T_GLASS_TEXT
  const y = lerp(1500, H / 2 - 10, k) + 12 * Math.sin(float * 1.6)
  const rotate = 2.2 * Math.sin(float * 1.1)
  const ink = poseBounds(GLASS_INK, { x: W / 2, y, rotate })
  const expect = expects(
    ink.bottom > H && 'overflow-canvas: 从画面下方升上来',
    ink.bottom <= H && ink.bottom + GLASS_SHADOW > H && 'effect-clipped: 升上来时阴影还在画面下沿外',
    y > H - 300 && 'text-overlap: 升上来时经过字幕',
  )
  return place({ x: W / 2, y, rotate, id: 'glass-text', attrs: expect ? { expect } : undefined }, GLASS_TEXT)
}

function glassScene(f: Frame): Child[] {
  const t = f.t
  if (t < L.glass.from - 0.15 || t > L.glass.to + 0.05) return []
  const dark = progress(t, L.glass.to - 0.55, L.glass.to, 'inOutSine')
  return [
    h('rect', { x: 0, y: 0, width: W, height: H, fill: C.red }),
    rows(t),
    lens(t),
    glassText(t),
    dark > 0 ? h('rect', { x: 0, y: 0, width: W, height: H, fill: C.night, opacity: dark.toFixed(3) }) : null,
  ]
}

// ---------------------------------------------------------------- 立体

const MO = (await glyph('墨', { font: 'Kai', size: 520, weight: 700 }))[0]!
/** 字身盒子的中心在 (W/2, H/2)，字脚踩在地面上。 */
const FLOOR = H / 2 - MO.height / 2 + MO.ink!.y + MO.ink!.height

const T_IN = L.solid.from + 0.05
export const T_EXTRUDE = at('solid', '挤出')
const T_ORBIT = at('solid', '立体')
const T_BALL = at('solid', '光照') - 0.5
const T_HOP = at('solid', '投影') - 0.1
export const T_HOP_LAND = T_HOP + 0.62
const T_BACK = L.solid.to - 1.2

function solidPose(t: number) {
  const grow = progress(t, T_EXTRUDE, T_EXTRUDE + 0.9, 'outCubic')
  const back = progress(t, T_BACK, T_BACK + 1.0, 'inOutCubic')
  const depth = 0.5 + 129.5 * grow * (1 - back)
  const rotY =
    keyframes(t, [
      { at: T_EXTRUDE, value: 0 },
      { at: T_EXTRUDE + 1.4, value: -32, ease: 'inOutCubic' },
      { at: T_ORBIT, value: -32 },
      { at: T_ORBIT + 3.2, value: 26, ease: 'inOutSine' },
    ]) * (1 - back)
  const rotX = -12 * grow * (1 - back)
  const u = progress(t, T_HOP, T_HOP_LAND)
  const hop = -120 * 4 * u * (1 - u)
  return { grow, back, depth, rotY, rotX, hop }
}

function solidScene(f: Frame): Child[] {
  const t = f.t
  if (t < L.solid.from - 0.05 || t > L.solid.to + 0.02) return []
  const show = spring(t - T_IN, { damping: 15, stiffness: 120 })
  const { back, depth, rotY, rotX, hop } = solidPose(t)
  const floor = progress(t, T_EXTRUDE + 0.2, T_EXTRUDE + 1.0, 'outCubic') * (1 - progress(t, T_BACK, T_BACK + 0.7, 'inCubic'))
  const ball = progress(t, T_BALL, T_BACK + 0.9, 'inOutSine')
  const bx = lerp(1780, -260, ball)
  const bz = -360 + 700 * ball * ball
  const rolling = t > T_BALL && t < T_BACK + 0.9
  return [
    sheet(
      { id: 'solid', perspective: 1600, expect: floor > 0.01 || rolling ? 'overflow-canvas: 地面和滚过的小球伸出画面' : undefined },
      floor > 0.01
        ? h('layer', { opacity: floor.toFixed(3), y: (220 * (1 - floor)).toFixed(1) }, h('box', { x: W / 2 - 1100, y: FLOOR.toFixed(1), width: 2200, height: 24, depth: 1200, fill: '#2a2d36' }))
        : null,
      rolling ? h('sphere', { cx: bx.toFixed(1), cy: (FLOOR - 80).toFixed(1), r: 80, z: bz.toFixed(1), fill: C.gold }) : null,
      h(
        'layer',
        {
          x: W / 2,
          y: (H / 2 + hop).toFixed(1),
          anchor: 'center',
          width: MO.width,
          height: MO.height,
          rotateY: rotY.toFixed(2),
          rotateX: rotX.toFixed(2),
          scale: show < 0.999 ? (0.85 + 0.15 * show).toFixed(4) : undefined,
          opacity: show < 0.999 ? Math.min(1, show).toFixed(3) : undefined,
        },
        h('extrude', { d: MO.d, depth: depth.toFixed(1), fill: C.red }),
      ),
    ),
  ]
}

/** 挤出厚度和转角实时读出来，就是写进 extrude 和 layer 的那两个数。 */
function solidReadout(f: Frame): Child {
  const t = f.t
  const a = fade(t, T_EXTRUDE, L.solid.to - 0.9, 0.3, 0.4)
  if (a <= 0) return null
  const p = solidPose(t)
  return place(
    { x: W - 120, y: 200, anchor: 'top-right', opacity: a },
    text(`depth ${p.depth.toFixed(0)}   rotateY ${p.rotY.toFixed(0)}°`, { fontFamily: LATIN, fontSize: 44, color: C.dim }),
  )
}

export function opticsScenes(f: Frame): Child[] {
  return [...glassScene(f), ...solidScene(f), solidReadout(f)]
}
