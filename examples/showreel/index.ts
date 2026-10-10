/**
 * 参考示例：48 秒、六段、120 BPM 的 flexlayer 绘图模式展示片。
 *   npm run mfl -- stills examples/showreel/index.ts --cues
 *   npm run mfl -- render examples/showreel/index.ts
 *
 * 分工：
 * - timeline.ts  全部时间（节拍、段落、cue），画面和声音都读它
 * - draws.ts     像素：笔触、几何、粒子、3D 点云、光效，全部在 draw 回调里画
 * - index.ts     结构：哪些层、在哪、什么时候出现，用框架原语搭（本文件）
 * - audio.ts     配乐：示例合成器按 cue 合成
 * - look.ts      这支片子的色板。深底加琥珀光是它自己的选择，新片子不要沿用
 */
import {
  clamp,
  defineComposition,
  ease,
  expects,
  fade,
  fx,
  h,
  lerp,
  mapBounds,
  noise1,
  place,
  progress,
  reveal,
  roll,
  shot,
  spring,
  springSteps,
  text,
  typewriter,
  box,
  type Child,
  type Frame,
  type Shot,
  type Token,
  type Vec2,
} from 'motionflexlayer'
import { audio } from './audio.js'
import {
  drawBackdrop,
  drawFlow,
  drawGeometry,
  drawGlint,
  drawGrid,
  drawHeadline,
  drawHudChrome,
  drawInk,
  drawPost,
  drawSign,
  drawSpace,
  drawViz,
  orbitZoom,
} from './draws.js'
import { AMBER, BG, CORAL, CYAN, INK, MUTED, VIOLET } from './look.js'
import { setupParticles } from './particles.js'
import {
  CARD_TIMES,
  CARD_WAVE,
  CODE_FROM,
  CODE_STEP,
  DURATION,
  FORMED,
  H,
  IMPACTS,
  MORPHS,
  SCATTER,
  SECTIONS,
  SPACE_MORPHS,
  SUB_FROM,
  TITLE_FROM,
  URL_FROM,
  W,
  ZOOM_FROM,
  ZOOM_TO,
  kickEnv,
  tl,
} from './timeline.js'

const SIZE = { width: W, height: H }

/** 取景窗 + 舞台两层。窗口铺满画面。 */
const framed = (cam: Shot, ...children: Child[]) => h('layer', { ...SIZE, view: cam.view }, h('layer', cam.stage, ...children))

/** 全画布绘图层。draws.ts 里的函数签名是 (ctx, t)。 */
const layerFx = (name: string, draw: (ctx: Parameters<Parameters<typeof fx>[1]>[0], t: number) => void) =>
  fx({ ...SIZE, name }, (ctx, el) => draw(ctx, el.t))

const label = (content: string, style: Parameters<typeof text>[1]) => text(content, style)

// ---------------------------------------------------------------- 镜头：每次重击震一下，05 段跟着底鼓轻颤

function shake(t: number) {
  let amp = 0
  for (const im of IMPACTS) if (t >= im.t) amp += im.amp * Math.exp(-(t - im.t) * 4.5)
  if (t > 32 && t < 39.5) amp += 2.2 * kickEnv(t, 9)
  return { x: amp * noise1(t * 31), y: amp * noise1(t * 29 + 77), r: amp * 0.05 * noise1(t * 17 + 5) }
}

// ---------------------------------------------------------------- 02 几何：边数计数器与公式

function geometryLabels(t: number): Child[] {
  const a = fade(t, 8.5, 15.7, 0.6, 0.4)
  if (a <= 0) return []
  const counter = roll(
    { value: springSteps(t, MORPHS.slice(1).map((m) => m.t), { damping: 11, stiffness: 150 }), cell: 180, size: 300 },
    MORPHS.map((m) => label(m.label, { fontSize: 150, fontWeight: 800, lineHeight: 1.2, color: INK })),
  )
  const slide = (1 - progress(t, 8.5, 9.3, ease.outCubic)) * 40
  return [
    place(
      { x: 200 - slide, y: 540, anchor: 'left', opacity: a },
      box(
        { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'start' },
        label('SIDES · 边数', { fontSize: 24, color: MUTED, letterSpacing: 6 }),
        counter,
        label('spring(damping 11, stiffness 150)', { fontSize: 24, color: AMBER, letterSpacing: 1 }),
      ),
    ),
    place(
      { x: 1720 + slide, y: 540, anchor: 'right', opacity: a },
      box(
        { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'end' },
        label('r(θ) = R cos(π/n) / cos(θ - π/n)', { fontSize: 26, color: INK }),
        label('n = ∞ → 3 → 4 → 6', { fontSize: 24, color: MUTED, letterSpacing: 2 }),
        label('四层轮廓，各晚 70ms 跟随', { fontSize: 24, color: MUTED }),
      ),
    ),
  ]
}

// ---------------------------------------------------------------- 03 粒子：说明

function flowCaption(t: number) {
  return place(
    { x: 960, y: 772 + (1 - progress(t, FORMED - 0.1, FORMED + 0.6, ease.outCubic)) * 18, opacity: fade(t, FORMED - 0.1, SCATTER + 0.1, 0.5, 0.25) },
    label('2400 个粒子 · 一个 draw 函数 · 每帧重算', { fontSize: 32, color: MUTED, letterSpacing: 6 }),
  )
}

// ---------------------------------------------------------------- 04 版式：卡片 + 推镜进轨道

const CARDS = [
  { title: '波形', code: 'ctx.lineTo(x, sin(x * f + t))', color: CYAN },
  { title: '数据', code: 'spring(t - beat, 10, 160)', color: AMBER },
  { title: '轨道', code: 'ctx.ellipse(0, 0, rx, ry)', color: VIOLET },
  { title: '地形', code: 'simplex3(x, row, t)', color: CORAL },
]
const CARD_W = 360
const CARD_H = 470
const CARD_GAP = 40
const CARD_Y = 650
const TILT = [-12, -5, 5, 12]

/** 轨道小图的太阳在画面上的位置：卡片 3 内容区中心。推镜就推向这里。 */
const ORBIT_AT: Vec2 = [960 + 0.5 * (CARD_W + CARD_GAP), CARD_Y - CARD_H / 2 + 25 + 135]

/** 卡片落地后的余震：衰减正弦。 */
const wave = (x: number) => (x <= 0 ? 0 : -Math.exp(-x * 5.5) * Math.sin(x * 11) * 70)

const SAFE = 0.04 * H
/** 左下角段落名所在的成片像素范围。 */
const HUD_ROLL = { left: 100, right: 460, top: H - 64 - 17, bottom: H - 64 + 17 }

/** 卡片下半部文字区在屏幕上的外接框：标题到代码行，左右收进 padding。flexlayer 的 outside-safe 只看左右。 */
const cardTextOnScreen = (cx: number, cy: number, cam: Shot) =>
  mapBounds({ left: cx - CARD_W / 2 + 24, top: cy - CARD_H / 2 + 312, right: cx + CARD_W / 2 - 24, bottom: cy - CARD_H / 2 + 405 }, cam.toScreen)

function card(i: number, t: number, cam: Shot) {
  const T = CARD_TIMES[i]!
  if (t < T) return null
  const e = spring(t - T, { damping: 12, stiffness: 140 })
  const away = i === 2 ? 0 : progress(t, ZOOM_FROM, ZOOM_FROM + 0.8, ease.smoothstep)
  const c = CARDS[i]!
  const x = 960 + (i - 1.5) * (CARD_W + CARD_GAP)
  const y = CARD_Y + (1 - e) * 360 + wave(t - CARD_WAVE[i]!)
  const txt = cardTextOnScreen(x, y, cam)
  const onCanvas = txt.right > 0 && txt.left < W && txt.bottom > 0 && txt.top < H
  const outside = onCanvas && (txt.left < SAFE || txt.right > W - SAFE)
  const overHud = e < 0.95 && txt.left < HUD_ROLL.right && txt.top < HUD_ROLL.bottom && txt.bottom > HUD_ROLL.top
  return place(
    {
      x,
      y,
      width: CARD_W,
      height: CARD_H,
      rotate: (1 - e) * TILT[i]!,
      origin: 'bottom',
      opacity: clamp((t - T) / 0.12) * (1 - away),
      attrs: {
        expect: expects(
          outside && 'outside-safe: 落进来和推镜时卡片文字经过画面边缘',
          overHud && 'text-overlap: 落进来时从左下角的段落名上经过',
        ),
      },
    },
    box(
      {
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 24,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 28,
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.14)',
        alignItems: 'start',
      },
      // 自定义标签 + 宽高 + draw：参与 flex 排版的绘图盒子
      h('viz', { width: 310, height: 270, draw: drawViz(i) }),
      box(
        { display: 'flex', gap: 14, alignItems: 'center' },
        label(`0${i + 1}`, { fontSize: 24, color: c.color, letterSpacing: 2 }),
        label(c.title, { fontSize: 38, fontWeight: 700, color: INK }),
      ),
      label(c.code, { fontSize: 24, color: MUTED }),
    ),
  )
}

function layoutScene(t: number) {
  if (t < 23.95 || t > ZOOM_TO + 0.05) return null
  // 推镜：放大 16 倍，同时把轨道中心从原位移到画面中心
  const zoom = Math.exp(Math.log(16) * orbitZoom(t))
  const travel = ease.inOutCubic(clamp((t - ZOOM_FROM) / (ZOOM_TO - 0.3 - ZOOM_FROM)))
  const screen: Vec2 = [lerp(ORBIT_AT[0], W / 2, travel), lerp(ORBIT_AT[1], H / 2, travel)]
  const headOut = 1 - progress(t, ZOOM_FROM, ZOOM_FROM + 0.6, ease.smoothstep)
  const subIn = progress(t, 27.5, 28.1, ease.smoothstep) * headOut
  // 镜头对准的舞台坐标 = 让 ORBIT_AT 落在 screen 处的那个点
  const cam = shot({ ...SIZE, zoom, x: ORBIT_AT[0] + (W / 2 - screen[0]) / zoom, y: ORBIT_AT[1] + (H / 2 - screen[1]) / zoom })
  return framed(
    cam,
    h('headline', { x: 960, y: 205, anchor: 'center', width: 1500, height: 140, opacity: headOut.toFixed(3), draw: (ctx, el) => drawHeadline(ctx, el, el.t) }),
    place({ x: 960, y: 322 + (1 - subIn) * 14, opacity: subIn }, label('布局交给 flex，像素交给 draw', { fontSize: 32, color: MUTED, letterSpacing: 6 })),
    ...[0, 1, 3, 2].map((i) => card(i, t, cam)),
  )
}

// ---------------------------------------------------------------- 05 空间：形状名

const SPACE_LABELS = ['SPHERE · 球体', 'TORUS · 环面', 'KNOT · 三叶结', 'SHELL · 噪声壳']

function spaceLabel(t: number) {
  const a = fade(t, 32.6, 38.7, 0.5, 0.3)
  if (a <= 0) return null
  return place(
    { x: 960, y: 905, opacity: a },
    box(
      { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' },
      roll(
        { value: springSteps(t, SPACE_MORPHS.slice(1), { damping: 12, stiffness: 160 }), cell: 40, size: 520, align: 'center' },
        SPACE_LABELS.map((s) => label(s, { fontSize: 26, color: INK, letterSpacing: 8 })),
      ),
      label('1800 个点 · 透视投影 · 全部画在 2D canvas 上', { fontSize: 24, color: MUTED, letterSpacing: 4 }),
    ),
  )
}

// ---------------------------------------------------------------- 06 落款

const code = (text: string, color: string): Token => ({ text, style: { color } })
const CODE_TOKENS: Token[] = [
  code('<draw>', AMBER),
  code(' ctx', CYAN),
  code('.fillRect', INK),
  code('(0, 0, ', MUTED),
  code('el.w', VIOLET),
  code(', ', MUTED),
  code('el.h', VIOLET),
  code(')', MUTED),
  code(' </draw>', AMBER),
]

function signScene(t: number): Child[] {
  if (t < TITLE_FROM - 0.05) return []
  const TW = 1500
  // 标题：蒙版从左往右擦出 + 字距从 74 收到 4（tracking-in），两个动作叠在一起
  const track = 70 * (1 - ease.outExpo(clamp((t - TITLE_FROM) / 1.4))) + 4
  const sub = progress(t, SUB_FROM, SUB_FROM + 0.7, ease.smoothstep)
  const url = progress(t, URL_FROM, URL_FROM + 0.6, ease.smoothstep)
  return [
    place(
      { x: 960, y: 452 },
      reveal(
        { progress: progress(t, TITLE_FROM, TITLE_FROM + 0.9, ease.outCubic), width: TW, height: 260 },
        place(
          { x: TW / 2, y: 130 },
          text('Flex Layer', { fontSize: 176, fontWeight: 800, color: INK, letterSpacing: track, glow: '46 #ffb54755' }, 'h1'),
        ),
      ),
    ),
    place({ x: 960, y: 700 + (1 - sub) * 18, opacity: sub }, label('绘图模式 · DRAW MODE', { fontSize: 40, color: MUTED, letterSpacing: 14 })),
    place(
      { x: 960, y: 800, opacity: progress(t, CODE_FROM - 0.3, CODE_FROM, ease.smoothstep) },
      typewriter(CODE_TOKENS, (t - CODE_FROM) / CODE_STEP + 1, { fontSize: 34 }),
    ),
    place({ x: 960, y: 884 + (1 - url) * 12, opacity: url }, label('github.com/ruochi/flexlayer', { fontSize: 26, color: AMBER, letterSpacing: 4 })),
  ]
}

// ---------------------------------------------------------------- HUD：在镜头外，不跟着震

function timecode(t: number) {
  const s = Math.floor(t)
  const p = (v: number) => String(v).padStart(2, '0')
  return `00:${p(s)}:${p(Math.floor((t - s) * 60))}`
}

function hud(f: Frame) {
  const t = f.t
  const a = progress(t, 0.8, 1.6, ease.smoothstep) * (1 - progress(t, 46.2, 46.9, ease.smoothstep))
  if (a <= 0.003) return null
  const ROW = 34
  const sectionRoll = roll(
    { value: springSteps(t, SECTIONS.slice(1).map((s) => s.from), { damping: 13, stiffness: 180 }), cell: ROW, size: 360 },
    SECTIONS.map((s) =>
      box(
        { display: 'flex', gap: 14, alignItems: 'center' },
        label(s.index, { fontSize: 24, color: AMBER, letterSpacing: 2 }),
        label(s.name, { fontSize: 24, color: INK }),
        label(s.en, { fontSize: 24, color: MUTED, letterSpacing: 4 }),
      ),
    ),
  )
  return place(
    { x: W / 2, y: H / 2, ...SIZE, opacity: a },
    fx({ ...SIZE, name: 'chrome' }, (ctx, el) => drawHudChrome(ctx, el, el.t, el.t / DURATION)),
    place(
      { x: 100, y: 90, anchor: 'left' },
      box(
        { display: 'flex', gap: 14, alignItems: 'center' },
        box({ width: 10, height: 10, borderRadius: 5, background: AMBER }),
        label('FLEX LAYER', { fontSize: 24, color: INK, letterSpacing: 6 }),
      ),
    ),
    place({ x: 1820, y: 90, anchor: 'right' }, label(`DRAW MODE  ·  ${tl.bpm} BPM  ·  ${f.fps} FPS`, { fontSize: 24, color: MUTED, letterSpacing: 3 })),
    place({ x: 100, y: H - 64, anchor: 'left' }, sectionRoll),
    place({ x: 1820, y: H - 64, anchor: 'right' }, label(timecode(t), { fontSize: 24, color: INK, letterSpacing: 2 })),
  )
}

// ---------------------------------------------------------------- 一帧

export default defineComposition({
  id: 'showreel',
  ...SIZE,
  fps: 60,
  duration: DURATION,
  background: BG,
  color: INK,
  timeline: tl,
  setup: setupParticles,
  audio,
  render: (f) => {
    const t = f.t
    const cam = shake(t)
    return [
      framed(
        shot({ ...SIZE, shakeX: cam.x, shakeY: cam.y, rotate: cam.r }),
        layerFx('backdrop', (ctx, tt) => {
          drawBackdrop(ctx, tt)
          drawGrid(ctx, tt)
        }),
        layerFx('ink', (ctx, tt) => {
          drawInk(ctx, tt)
          drawGeometry(ctx, tt)
          drawFlow(ctx, tt)
        }),
        ...geometryLabels(t),
        flowCaption(t),
        layoutScene(t),
        t >= ZOOM_TO - 0.2 && t <= 40.1 && layerFx('space', drawSpace),
        spaceLabel(t),
        ...signScene(t),
        t >= 40 && layerFx('sign', drawSign),
        t >= 45.9 && t <= 47 && layerFx('glint', (ctx, tt) => drawGlint(ctx, tt, [592, 386])),
      ),
      hud(f),
      layerFx('post', drawPost),
    ]
  },
})

