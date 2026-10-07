/**
 * 旁白驱动的短片：先写文案，念出来，再按念出来的长度排画面和音乐。
 *   npm run mfl -- stills examples/narrated/index.ts --cues
 *   npm run mfl -- audio  examples/narrated/index.ts
 *   npm run mfl -- render examples/narrated/index.ts
 *
 * 流程就是 MOTION.md 的标准输入流程：文案 → 旁白 → 时间轴 → 画面 → 声音 → 检查 → 渲染。
 * 旁白缓存在 voice/ 目录，已提交，离线可重现；改了文案会重新合成（需要 pip install edge-tts 和网络）。
 */
import { chord, type Track } from 'visualtone'
import {
  box,
  defineComposition,
  fade,
  fx,
  h,
  narration,
  place,
  progress,
  pulse,
  rgba,
  spring,
  text,
  type Child,
  type Frame,
  type PlannedLine,
} from 'motionflexlayer'

const W = 1920
const H = 1080
const PAPER = '#f2ede3'
const INK = '#1f1c18'
const DIM = '#b9b0a2'
const ACCENT = '#d9472b'
const CALM = '#2f6f62'

// ---------------------------------------------------------------- 1. 文案 → 旁白 → 时间轴

const vo = await narration(
  [
    { id: 'intro', text: '这是一段用代码写出来的短片。', minDuration: 3.2 },
    { id: 'frame', text: '每一帧都是时间的函数：给出同一个 t，就得到同一幅画面。' },
    { id: 'voice', text: '旁白先念出来，每一段的长短，跟着旁白走。' },
    { id: 'sound', text: '旁白说话时，音乐让出人声的频段；音效落在同一组时间点上。' },
    { id: 'check', text: '渲染之前，排版检查逐帧找出重叠和越界。', minDuration: 4.6 },
    { id: 'outro', text: '改一句文案，重新渲染，画面和声音一起对齐。' },
  ],
  { baseDir: import.meta.url, voice: 'zh-CN-XiaoxiaoNeural', rate: '+4%' },
)
const tl = vo.timeline()
const lines = vo.lines
const L = Object.fromEntries(lines.map((l) => [l.id, l])) as Record<string, PlannedLine>

/** 念到"重叠"时卡片分开，"没有问题"和提示音跟着落下。 */
const SEPARATE = (L.check!.words.find((w) => w.text.includes('重叠')) ?? L.check!.words[0]!).from
const RESOLVED = SEPARATE + 0.6

/** 本段的入场、出场：段首 0.35s 淡入，段尾 0.3s 淡出。 */
const presence = (t: number, l: PlannedLine) => fade(t, l.from, l.to, 0.35, 0.3)

// ---------------------------------------------------------------- 2. 帧函数：t → 画面

/** 顶部的时间轴：每段一格，宽度就是旁白排出来的时长；短竖线是每个词的开口时刻。 */
function ruler(f: Frame) {
  const x0 = 160
  const x1 = W - 160
  const y = 96
  const sx = (t: number) => x0 + ((x1 - x0) * t) / vo.duration
  return fx({ width: W, height: 200, x: W / 2, y: 100, name: 'ruler' }, (ctx) => {
    ctx.lineCap = 'round'
    for (const l of lines) {
      const a = sx(l.from) + 3
      const b = sx(l.to) - 3
      ctx.strokeStyle = rgba(INK, 0.14)
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(a, y)
      ctx.lineTo(b, y)
      ctx.stroke()
      const k = Math.min(1, Math.max(0, (f.t - l.from) / (l.to - l.from)))
      if (k > 0) {
        ctx.strokeStyle = l.id === f.section?.name ? ACCENT : INK
        ctx.beginPath()
        ctx.moveTo(a, y)
        ctx.lineTo(a + (b - a) * k, y)
        ctx.stroke()
      }
      ctx.fillStyle = rgba(INK, 0.35)
      for (const w of l.words) ctx.fillRect(Math.round(sx(w.from)), y + 14, 1.5, 10)
    }
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(sx(f.t), y, 11, 0, Math.PI * 2)
    ctx.fill()
  })
}

function header(f: Frame) {
  const s = f.section
  if (!s) return null
  return place(
    { x: 160, y: 150, anchor: 'top-left' },
    box(
      { display: 'flex', gap: 24, alignItems: 'baseline' },
      text(`${String(s.index + 1).padStart(2, '0')} / ${String(lines.length).padStart(2, '0')}`, { fontSize: 44, fontWeight: 700, color: INK }),
      text(s.name, { fontSize: 44, color: DIM, letterSpacing: '0.06em' }),
    ),
  )
}

/** 字幕：念过的字是墨色，正在念的词是强调色，还没念到的是浅灰。 */
function caption(f: Frame) {
  const c = vo.caption(f.t)
  if (!c) return null
  const { line, spoken, word } = c
  const a = presence(f.t, line)
  const head = word ? word.start : spoken
  const tailFrom = word ? Math.max(word.end, spoken) : spoken
  return place(
    { x: W / 2, y: 930, opacity: a },
    h(
      'p',
      { style: 'white-space:nowrap; font-size:50px; font-weight:600; letter-spacing:0.02em' },
      h('span', { style: `color:${INK}` }, line.text.slice(0, head)),
      word ? h('span', { id: 'word', style: `color:${ACCENT}` }, line.text.slice(word.start, tailFrom)) : null,
      h('span', { style: `color:${DIM}` }, line.text.slice(tailFrom)),
    ),
  )
}

function intro(f: Frame) {
  const l = L.intro!
  const a = presence(f.t, l)
  if (a <= 0) return null
  const s = spring(f.t - 0.3, { damping: 14, stiffness: 120 })
  const sub = spring(f.t - 1.1, { damping: 16, stiffness: 140 })
  return [
    place({ x: W / 2, y: 470 + (1 - s) * 60, opacity: a * Math.min(1, s * 1.4) }, text('motion flex layer', { fontSize: 150, fontWeight: 800, color: INK, letterSpacing: '-0.02em' })),
    place({ x: W / 2, y: 610 + (1 - sub) * 30, opacity: a * sub }, text('代码写的视频 · 旁白排的时间轴', { fontSize: 44, color: CALM })),
  ]
}

/** 同一个 t 永远是同一帧：读数、帧格都只由 t 算出。 */
function frameFn(f: Frame) {
  const l = L.frame!
  const a = presence(f.t, l)
  if (a <= 0) return null
  const fps = f.fps
  const cells: Child[] = []
  const n = 15
  const cur = f.frame % n
  for (let i = 0; i < n; i++) {
    const on = i === cur
    cells.push(h('div', { style: `width:64px; height:44px; border-radius:6px; background:${on ? ACCENT : rgba(INK, i < cur ? 0.55 : 0.12)}` }))
  }
  return [
    place(
      { x: W / 2, y: 430, opacity: a },
      box(
        { display: 'flex', gap: 80, alignItems: 'baseline' },
        text(`t = ${f.t.toFixed(2)} s`, { fontSize: 110, fontWeight: 700, color: INK }),
        text(`frame ${String(f.frame).padStart(4, '0')}`, { fontSize: 60, color: DIM }),
      ),
    ),
    place({ x: W / 2, y: 610, opacity: a }, box({ display: 'flex', gap: 14 }, ...cells)),
    place({ x: W / 2, y: 700, opacity: a * 0.9 }, text(`${fps} fps · render(t) → 画面`, { fontSize: 44, color: CALM })),
  ]
}

/** 旁白电平的滚动波形，加上已经念出来的词。电平来自混音时算好的包络，仍然只依赖 t。 */
function voiceFn(f: Frame) {
  const l = L.voice!
  const a = presence(f.t, l)
  if (a <= 0 || !f.audio) return null
  const audio = f.audio
  const said = l.words.filter((w) => w.from <= f.t)
  return [
    fx({ width: 1400, height: 260, x: W / 2, y: 420, name: 'voice-wave' }, (ctx) => {
      ctx.globalAlpha = a
      const bars = 90
      for (let k = 0; k < bars; k++) {
        const t = f.t - (bars - 1 - k) / 30
        const v = Math.min(1, audio.at(t).level('voice') * 5)
        const hgt = 6 + v * 230
        ctx.fillStyle = k === bars - 1 ? ACCENT : rgba(INK, 0.25 + 0.6 * (k / bars))
        ctx.fillRect(k * (1400 / bars) + 2, 130 - hgt / 2, 1400 / bars - 5, hgt)
      }
    }),
    place(
      { x: W / 2, y: 660, width: 1500, opacity: a },
      box(
        { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, width: 1500 },
        ...said.map((w) => {
          const k = spring(f.t - w.from, { damping: 18, stiffness: 260 })
          return h('p', { style: `font-size:46px; padding:6px 18px; border-radius:10px; background:${rgba(INK, 0.08)}; color:${INK}; opacity:${k.toFixed(3)}` }, w.text)
        }),
      ),
    ),
  ]
}

/** 两根电平表：旁白一开口，音乐的读数就降下来。下面的点是音效的起音。 */
function soundFn(f: Frame) {
  const l = L.sound!
  const a = presence(f.t, l)
  if (a <= 0 || !f.audio) return null
  const audio = f.audio
  const meter = (label: string, track: string, color: string) => {
    const db = Math.max(-60, audio.db(track))
    const w = Math.round(((db + 60) / 60) * 1000)
    return box(
      { display: 'flex', alignItems: 'center', gap: 30 },
      text(label, { fontSize: 48, color: INK, width: 120 }),
      h('div', { style: `width:1000px; height:36px; border-radius:18px; background:${rgba(INK, 0.08)}; display:flex` }, h('div', { style: `width:${Math.max(36, w)}px; height:36px; border-radius:18px; background:${color}` })),
      text(`${db.toFixed(0)} dB`, { fontSize: 44, color: DIM, width: 170 }),
    )
  }
  const hits = audio.onsets('fx').filter((t) => t <= f.t && t > l.from - 0.5)
  return [
    place({ x: W / 2, y: 440, opacity: a }, box({ display: 'flex', flexDirection: 'column', gap: 40 }, meter('旁白', 'voice', ACCENT), meter('音乐', 'pad', CALM))),
    fx({ width: 1400, height: 80, x: W / 2, y: 660, name: 'sfx-dots' }, (ctx) => {
      ctx.globalAlpha = a
      hits.forEach((t, i) => {
        const p = pulse(f.t, [t], 6)
        ctx.fillStyle = mixDot(p)
        ctx.beginPath()
        ctx.arc(700 + (i - (hits.length - 1) / 2) * 60, 40, 12 + p * 14, 0, Math.PI * 2)
        ctx.fill()
      })
    }),
  ]
}

const mixDot = (p: number) => (p > 0.05 ? ACCENT : rgba(INK, 0.3))

/** 两张卡片先压在一起，检查报重叠，再分开。故意的重叠写进 expect，报告里降为 info。 */
function checkFn(f: Frame) {
  const l = L.check!
  const a = presence(f.t, l)
  if (a <= 0) return null
  const apart = spring(f.t - SEPARATE, { damping: 15, stiffness: 120 })
  const overlap = apart < 0.5
  // 重叠报在先画的那张卡片上，expect 也只写在它身上
  const card = (label: string, x: number, color: string, id: string, expect?: string) =>
    place(
      { x, y: 470, id, attrs: expect ? { expect } : undefined },
      h('div', { style: `width:520px; height:260px; border-radius:24px; background:${color}; display:flex; align-items:center; justify-content:center` }, text(label, { fontSize: 72, fontWeight: 800, color: PAPER })),
    )
  const dx = 40 + apart * 400
  const ok = progress(f.t, RESOLVED - 0.1, RESOLVED + 0.2)
  return [
    card('标题', W / 2 - dx, INK, 'card-a', overlap ? 'text-overlap: 演示重叠检查' : undefined),
    card('副标题', W / 2 + dx, CALM, 'card-b'),
    place(
      { x: W / 2, y: 690, opacity: a },
      text(overlap ? '⚠ text-overlap  card-a ↔ card-b' : '✓ 没有问题', { fontSize: 46, fontWeight: 700, color: overlap ? ACCENT : rgba(CALM, 0.4 + 0.6 * ok) }),
    ),
  ]
}

function outro(f: Frame) {
  const l = L.outro!
  const a = fade(f.t, l.from, vo.duration + 1, 0.35, 0.1)
  if (a <= 0) return null
  const s = spring(f.t - l.from - 0.15, { damping: 13, stiffness: 140 })
  const end = progress(f.t, vo.duration - 0.6, vo.duration)
  return [
    place({ x: W / 2, y: 430 + (1 - s) * 50, opacity: a * s }, text('flexlayer · visualtone · motionflexlayer', { fontSize: 76, fontWeight: 800, color: INK })),
    place({ x: W / 2, y: 560, opacity: a * s * (1 - end * 0.5) }, text('github.com/ruochi/motionflexlayer', { fontSize: 46, color: CALM })),
  ]
}

// ---------------------------------------------------------------- 3. 声音：旁白、按段落换和弦的电钢、音效

const PROGRESSION = [
  ['Fmaj7', 'F3'],
  ['C', 'C4'],
  ['G', 'G3'],
  ['Am7', 'A3'],
  ['Fmaj7', 'F3'],
  ['Csus2', 'C4'],
] as const

/** 每段一个和弦，段内每 1.6 秒轻轻再弹一次。和弦切换落在段落边界上，所以跟着旁白走。 */
function music(): Track[] {
  const pad: Track = { id: 'pad', role: 'music', engine: 'epiano', hue: 210, lightness: 0.42, space: 0.55, release: 900, notes: [], duck: { by: 'voice', amount: 0.75, band: [1000, 4000], holdMs: 250 } }
  const bass: Track = { id: 'bass', role: 'music', hue: 24, lightness: 0.3, release: 400, notes: [] }
  lines.forEach((l, i) => {
    const [sym, root] = PROGRESSION[i % PROGRESSION.length]!
    const tones = chord(sym, root)
    const end = l.to
    for (let t = l.from, k = 0; t < end - 0.4; t += 1.6, k++) {
      const len = Math.min(1.8, end - t)
      tones.forEach((y, j) => pad.notes!.push({ t: t + j * 0.03, y: y + 12, size: k === 0 ? 0.1 : 0.07, duration: len, ease: 'exp' }))
    }
    bass.notes!.push({ t: l.from, y: tones[0]! - 12, size: 0.022, duration: Math.max(0.5, end - l.from - 0.05), ease: 'hold' })
  })
  return [pad, bass]
}

function effects(): Track {
  return {
    id: 'fx',
    role: 'sfx',
    sfx: [
      { sfx: 'shimmer', t: 0.25, size: 0.35 },
      ...lines.slice(1).map((l, i) => ({ sfx: 'whoosh' as const, t: Math.max(0, l.from - 0.2), size: 0.3, direction: i % 2 ? -0.6 : 0.6 })),
      { sfx: 'tick', t: RESOLVED, size: 0.6 },
      { sfx: 'impact', t: L.outro!.from + 0.15, size: 0.45, low: 0.6 },
    ],
  }
}

// ---------------------------------------------------------------- 4. 合成

export default defineComposition({
  width: W,
  height: H,
  fps: 30,
  duration: vo.duration,
  background: PAPER,
  color: INK,
  timeline: tl,
  envelopes: true,
  render: (f) => [ruler(f), header(f), intro(f), frameFn(f), voiceFn(f), soundFn(f), checkFn(f), outro(f), caption(f)],
  audio: () => ({
    clips: vo.clips(),
    buses: { voice: { comp: { threshold: -24, ratio: 2.5, attackMs: 8, releaseMs: 120, knee: 6, makeup: 0 } } },
    tracks: [...music(), effects()],
    master: { lufs: -16, fadeOut: 0.8, reverb: { size: 0.7, decay: 0.55, preDelayMs: 30, damping: 0.4, width: 0.9 } },
  }),
})
