/**
 * 全片共用：画布、旁白时间、片头片尾以外每段都有的标签、进度点和字幕、印章。
 * 通用的部分（摆字形、着墨外接框、离画布边多远、路径长度、词的开口时刻）都在框架里，这里只剩这支片子自己的东西。
 */
import { box, edgeRoom, fade, fx, h, place, poseBounds, progress, rgba, runs, spring, text, wordProgress, type Child, type Frame, type GlyphPose, type PlannedLine } from 'motionflexlayer'
import { C, LATIN } from './look.js'
import { vo } from './script.js'

export { vo }
export const W = 1920
export const H = 1080

export type Id = 'intro' | 'glyphs' | 'reflow' | 'stroke' | 'glass' | 'solid' | 'camera' | 'report' | 'outro'
export const L = Object.fromEntries(vo.lines.map((l) => [l.id, l])) as Record<Id, PlannedLine>

/** 某句旁白里第 nth 个含 word 的词开口的时刻。 */
export const at = (id: Id, word: string, nth = 0) => vo.at(id, word, nth)

/** 64px 的字身，四周各留 4px。 */
const BODY = { left: -36, top: -36, right: 36, bottom: 36 }
/** 字身中心在 p 的字有没有伸出画布。用来决定这一帧要不要写 overflow-canvas 的 expect。 */
export const offCanvas = (p: GlyphPose) => edgeRoom(poseBounds(BODY, { x: p.x, y: p.y, scale: p.scale }), W, H) < 0

/** 整幅画布大小的一层，放 placeGlyph 摆好的字。 */
export const sheet = (attrs: Record<string, string | number | undefined>, ...children: Child[]) =>
  h('layer', { width: W, height: H, ...attrs }, ...children)

// ---------------------------------------------------------------- 每段都有的画面元素

type Chapter = { api: string; note: string }

/** 每段左上角：这一段用到的 flexlayer 能力，以及换成网页或手写 canvas 卡在哪。 */
const CHAPTERS: Partial<Record<Id, Chapter>> = {
  glyphs: { api: 'glyph() · canvas.create()', note: '网页要拆成 span 再量 DOM；手写 canvas 没有排版' },
  reflow: { api: 'canvas.create() · writing-mode', note: '逐字过渡要先排好两套版面，再一个字一个字对上' },
  stroke: { api: 'ink-stroke', note: 'CSS 描边压在笔画中线上，几个字也合不成一圈' },
  glass: { api: 'glass', note: 'backdrop-filter 只会模糊，折射要自己写着色器' },
  solid: { api: 'extrude · perspective', note: '网页要 three.js，还要把中文字体转成几何体' },
  camera: { api: 'view · canvas.create()', note: '网页要先渲染一遍，量出目标的位置再推镜' },
  report: { api: 'checkFvg() · anchor-box="ink"', note: '浏览器只给盒子；字形的边界要逐字去量' },
}

const ORDER = vo.lines.map((l) => l.id as Id)
const NUMBERED = ORDER.filter((id) => CHAPTERS[id])

export function chapter(f: Frame): Child[] {
  const out: Child[] = []
  for (const id of NUMBERED) {
    const l = L[id]
    const ch = CHAPTERS[id]!
    const a = fade(f.t, l.from + 0.1, l.to, 0.3, 0.35)
    if (a <= 0) continue
    const k = spring(f.t - l.from - 0.1, { damping: 20, stiffness: 160 })
    const n = String(NUMBERED.indexOf(id) + 1).padStart(2, '0')
    out.push(
      place(
        { x: 96, y: 66, anchor: 'top-left', opacity: a, id: `chapter-${id}` },
        box(
          // 玻璃一段的底是红色跑马灯，标签垫一块夜色才读得清；在夜色底上看不出这块垫子
          { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '14px 24px', background: rgba(C.night, 0.88), borderRadius: 16 },
          box(
            { display: 'flex', gap: 22, alignItems: 'baseline' },
            text(n, { fontFamily: LATIN, fontWeight: 700, fontSize: 46, color: C.red }),
            text(ch.api, { fontFamily: LATIN, fontSize: 46, color: C.paper, opacity: k }),
          ),
          text(ch.note, { fontSize: 44, color: C.dim, opacity: progress(f.t, l.from + 0.5, l.from + 1.1) }),
        ),
      ),
    )
  }
  return out
}

/** 右上角一排点，每段一个。当前段拉长成红色胶囊，换段时用弹簧过去。 */
export function dots(f: Frame): Child {
  const a = fade(f.t, L.intro.to - 0.6, L.outro.from + 0.6, 0.5, 0.5)
  if (a <= 0) return null
  const n = ORDER.length
  return fx({ x: W - 120 - 150, y: 104, width: 300, height: 40, name: 'dots' }, (ctx) => {
    ctx.globalAlpha = a
    ctx.fillStyle = rgba(C.night, 0.88)
    ctx.beginPath()
    ctx.roundRect(0, 0, 300, 40, 20)
    ctx.fill()
    // 9 个点连同间隔共 250px，两边各留 25
    let x = 275
    for (let i = n - 1; i >= 0; i--) {
      const l = L[ORDER[i]!]
      const on = spring(f.t - l.from, { damping: 18, stiffness: 220 }) - spring(f.t - l.to, { damping: 18, stiffness: 220 })
      const w = 12 + 30 * Math.max(0, on)
      x -= w
      ctx.fillStyle = on > 0.5 ? C.red : rgba(C.paper, f.t > l.to ? 0.55 : 0.22)
      ctx.beginPath()
      ctx.roundRect(x, 14, w, 12, 6)
      ctx.fill()
      x -= 14
    }
  })
}

/**
 * 字幕。时间来自 f.subtitle 的逐字轨，颜色是这一帧自己的决定：
 * 已经开口的词整词亮，还没到的词暗。逐字淡入可以改成用 ch.progress。
 */
export function subtitle(f: Frame): Child {
  const now = f.subtitle
  if (!now) return null
  const a = fade(f.t, now.line.from, now.line.to, 0.25, 0.25)
  const done = f.t >= now.line.speechTo
  const spans = runs(now.chars, (ch) => (done || wordProgress(now, ch) > 0 ? C.paper : rgba(C.paper, 0.38)))
  return place(
    { x: W / 2, y: 1000, opacity: a, id: 'subtitle' },
    h(
      'p',
      { style: 'white-space:nowrap; font-size:44px; letter-spacing:0.02em' },
      ...spans.map((s) => h('span', { style: `color:${s.key}` }, s.text)),
    ),
  )
}

/** 印章：红底竖排两个字。片头盖一次，片尾再盖一次。k 是落下的进度，away 是收走的进度。 */
export function seal(x: number, y: number, k: number, rotate: number, away = 0): Child {
  if (k <= 0.002 || away >= 0.999) return null
  const s = (1 + 0.9 * (1 - Math.min(1, k))) * (1 - away)
  return place(
    {
      x,
      y,
      scale: Math.max(0.001, s),
      rotate: rotate + 50 * away,
      opacity: Math.min(1, k * 3) * (1 - away * away),
      id: 'seal',
      attrs: s < 0.5 ? { expect: 'min-font-size: 转着收走时缩小' } : undefined,
    },
    h(
      'div',
      { style: `width:132px; height:132px; border-radius:16px; background:${C.red}; display:flex; align-items:center; justify-content:center` },
      h('p', { style: `writing-mode:vertical-rl; font-family:Kai; font-weight:700; font-size:50px; color:${C.paper}; letter-spacing:2px` }, '着墨'),
    ),
  )
}
