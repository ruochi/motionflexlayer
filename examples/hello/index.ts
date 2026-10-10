/**
 * 最小完整示例：10 秒、120 BPM。
 *   npm run mfl -- stills examples/hello/index.ts
 *   npm run mfl -- render examples/hello/index.ts
 *
 * 结构就是 MOTION.md 里的四步：时间轴 → 帧函数 → 音频 → 验证。
 * 颜色只从 look.ts 来。那是这支片子的选择；换一支片子，换掉 look.ts，下面的时间和结构照用。
 */
import { BG, BLUE, INK, MUTED, RED } from './look.js'
import {
  box,
  defineComposition,
  drawGlyphs,
  ease,
  fade,
  font,
  fx,
  h,
  place,
  progress,
  pulse,
  reveal,
  rgba,
  roll,
  sfx,
  shot,
  spring,
  springSteps,
  stagger,
  text,
  timeline,
  tokenLength,
  typewriter,
  wiggle,
  type Frame,
  type Token,
} from 'motionflexlayer'

const W = 1920
const H = 1080

// ---------------------------------------------------------------- 1. 时间轴：画面和声音共用

const tl = timeline({ bpm: 120, duration: 10 })
  .section('intro', 0)
  .section('build', 2)
  .section('drop', 4)
  .section('outro', 8)
tl.cue('kick', tl.beats(4, 16))
  .cue('impact', tl.bar(2))
  .cue('whoosh', tl.bar(2) - 0.45)
  .cue('chime', tl.bar(4))

const TITLE = 'motion flexlayer'
const TITLE_AT = 0.4
const SUB_AT = 1.5
const CODE: Token[] = [
  { text: 'spring', style: { color: BLUE } },
  { text: '(t - ', style: { color: INK } },
  { text: "tl.at('impact')", style: { color: RED } },
  { text: ')', style: { color: INK } },
]
const CODE_AT = 5
const CODE_STEP = 0.045
tl.cue(
  'type',
  Array.from({ length: tokenLength(CODE) }, (_, i) => CODE_AT + i * CODE_STEP),
)

const kicks = tl.times('kick')
const impact = tl.at('impact')

// ---------------------------------------------------------------- 2. 帧函数：t → 画面

function backdrop(f: Frame) {
  return fx({ width: W, height: H, name: 'backdrop' }, (ctx) => {
    // 每个底鼓放出一圈冲击波：半径随时间扩张，线宽和透明度随之衰减
    for (const k0 of kicks) {
      const dt = f.t - k0
      if (dt < 0 || dt > 1.2) continue
      const k = dt / 1.2
      const r = 120 + ease.outCubic(k) * 620
      ctx.strokeStyle = rgba(k0 === impact ? BLUE : INK, 0.5 * (1 - k))
      ctx.lineWidth = (k0 === impact ? 14 : 4) * (1 - 0.6 * k)
      ctx.beginPath()
      ctx.arc(W / 2, H * 0.46, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
}

/** 逐字入场：每个字从下方带旋转弹进来，从中间向两边交错。冲击时逐字错开地跳一下。 */
function title(f: Frame) {
  return fx({ width: W, height: H, name: 'title' }, (ctx) => {
    const hit = pulse(f.t, [impact], 5)
    drawGlyphs(ctx, TITLE, {
      x: W / 2,
      y: H * 0.46 + 50,
      align: 'center',
      font: font(150, 800),
      color: INK,
      letterSpacing: 2,
      each: (g, n) => {
        const local = f.t - TITLE_AT - stagger(g.index, n, { each: 0.045, from: 'center' })
        const e = spring(local, { damping: 13, stiffness: 150 })
        if (local <= 0) return null
        const out = progress(f.t, 7.8 + g.index * 0.012, 8.3 + g.index * 0.012, 'inCubic')
        return {
          dy: (1 - e) * 120 - hit * 26 * Math.sin(g.index * 0.9) + out * 60,
          rotate: (1 - e) * 18,
          scale: 1 + hit * 0.06,
          alpha: Math.min(1, local / 0.15) * (1 - out),
          color: g.ch === 'f' || g.ch === 'l' ? BLUE : INK,
        }
      },
    })
  })
}

function subtitle(f: Frame) {
  const p = progress(f.t, SUB_AT, SUB_AT + 0.9, 'outCubic')
  const out = 1 - progress(f.t, 7.7, 8.2)
  return place(
    { x: W / 2, y: H * 0.46 + 140, opacity: out },
    reveal(
      { progress: p, width: 900, height: 60 },
      place(
        { x: 450, y: 30 },
        text('时间轴 · 节拍 · 弹簧 · 镜头 · 音轨', { fontSize: 34, fontWeight: 600, color: MUTED, letterSpacing: 4 }),
      ),
    ),
  )
}

/** 节拍计数器：每个底鼓滚一格，用弹簧滚，不是瞬间跳。 */
function beatCounter(f: Frame) {
  const a = fade(f.t, 1.8, 8.4, 0.4, 0.4)
  const value = springSteps(f.t, kicks, { damping: 14, stiffness: 220 })
  const cells = Array.from({ length: kicks.length + 1 }, (_, i) =>
    text(String(i).padStart(2, '0'), { fontSize: 64, fontWeight: 800, color: i === 5 ? RED : INK }),
  )
  // layer 只负责定位，不排版：并排的东西放进 flex 容器
  return place(
    { x: W - 100, y: 160, anchor: 'right', opacity: a },
    box(
      { display: 'flex', alignItems: 'center', gap: 18 },
      text('BEAT', { fontSize: 24, color: MUTED, letterSpacing: 6 }),
      roll({ value, cell: 80, size: 90, align: 'end' }, cells),
    ),
  )
}

function codeLine(f: Frame) {
  const shown = (f.t - CODE_AT) / CODE_STEP + 1
  const a = fade(f.t, CODE_AT - 0.2, 8.1, 0.2, 0.4)
  return place(
    { x: W / 2, y: H * 0.78, opacity: a },
    typewriter(CODE, shown, { fontSize: 36, letterSpacing: 1 }),
  )
}

function outro(f: Frame) {
  const a = fade(f.t, 8.45, 10.5, 0.5, 0.6)
  const e = spring(f.t - 8.45, { damping: 16, stiffness: 120 })
  return place(
    { x: W / 2, y: H / 2 + (1 - e) * 30, opacity: a },
    text('github.com/ruochi/motionflexlayer', { fontSize: 44, color: INK, letterSpacing: 4 }),
  )
}

function hud(f: Frame) {
  const s = Math.floor(f.t)
  const fr = Math.floor((f.t - s) * f.fps)
  return [
    place({ x: 100, y: 90, anchor: 'left' }, text(`${f.section?.name.toUpperCase() ?? ''}`, { fontSize: 24, color: MUTED, letterSpacing: 6 })),
    place(
      { x: W - 100, y: H - 80, anchor: 'right' },
      text(`00:${String(s).padStart(2, '0')}:${String(fr).padStart(2, '0')}  ·  beat ${Math.max(0, Math.floor(f.beat)) + 1}`, {
        fontSize: 24,
        color: MUTED,
        letterSpacing: 2,
      }),
    ),
  ]
}

export default defineComposition({
  id: 'hello',
  width: W,
  height: H,
  fps: 60,
  duration: 10,
  background: BG,
  color: INK,
  timeline: tl,
  render: (f) => {
    const hit = pulse(f.t, [impact], 6)
    const zoom = 1 + progress(f.t, 0, 8, 'inOutSine') * 0.06 + hit * 0.05
    const cam = shot({
      width: W,
      height: H,
      zoom,
      shakeX: wiggle(f.t, 18, 14 * hit, 1),
      shakeY: wiggle(f.t, 18, 14 * hit, 2),
      rotate: wiggle(f.t, 9, 0.6 * hit, 3),
    })
    return [
      h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, backdrop(f), title(f), subtitle(f), codeLine(f), outro(f))),
      beatCounter(f),
      ...hud(f),
    ]
  },
  // ---------------------------------------------------------------- 3. 音频：文件放到 cue 上
  audio: ({ tl }) => ({
    clips: [
      { src: '../assets/bgm-loop.wav', at: 0, loop: true, gain: -7, fadeIn: 1.5, bus: 'music' },
      ...sfx('../assets/kick.wav', tl.times('kick'), { gain: -5, bus: 'drums' }),
      ...sfx('../assets/whoosh.wav', tl.times('whoosh'), { gain: -6 }),
      ...sfx('../assets/impact.wav', tl.times('impact'), { gain: -3 }),
      ...tl.times('type').map((at, i, all) => ({ src: '../assets/tick.wav', at, gain: -14, pan: (i / all.length - 0.5) * 0.8 })),
      ...sfx('../assets/chime.wav', tl.times('chime'), { gain: -4 }),
    ],
    buses: {
      // 音乐给底鼓让路：和画面的脉冲用同一组时间
      music: { duck: { times: tl.times('kick'), depth: 0.55, release: 0.16 } },
    },
    master: { lufs: -16, fadeOut: 1.5 },
  }),
})
