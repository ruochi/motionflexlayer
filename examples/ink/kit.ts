/**
 * 全片共用：画布、配色、旁白时间、字形摆放、片头片尾以外每段都有的标签、进度点和字幕。
 */
import type { Glyph } from 'flexlayer'
import { box, fade, fx, h, place, progress, rgba, spring, text, type Child, type Frame, type FvgNode, type PlannedLine } from 'motionflexlayer'
import { vo } from './script.js'

export { vo }
export const W = 1920
export const H = 1080

export const C = {
  night: '#121318',
  night2: '#1d1f27',
  paper: '#efe7d6',
  dim: '#8f897d',
  red: '#e0432b',
  gold: '#e8b04a',
  blue: '#7aa2ff',
} as const

export const LATIN = 'SpaceGrotesk'

export type Id = 'intro' | 'glyphs' | 'reflow' | 'stroke' | 'glass' | 'solid' | 'camera' | 'report' | 'outro'
export const L = Object.fromEntries(vo.lines.map((l) => [l.id, l])) as Record<Id, PlannedLine>

/** 某句旁白里第 nth 个含 word 的词开口的时刻。动作卡在词上，改了文案、换了音色都跟着走。 */
export function at(id: Id, word: string, nth = 0): number {
  const w = L[id].words.filter((x) => x.text.includes(word))[nth]
  if (!w) throw new Error(`旁白 ${id} 里没有“${word}”`)
  return w.from
}

const r2 = (v: number) => Math.round(v * 100) / 100

export type GlyphPose = {
  /** 字身盒子中心。 */
  x: number
  y: number
  scale?: number
  rotate?: number
  opacity?: number
  fill?: string
}

/**
 * 把一个字形摆到 (x, y)：旋转、缩放都绕字身中心。
 * 每个字一层 layer 而不是 g：外层的 ink-stroke、shadow 合并子树墨迹时只认 layer，g 里的路径会被漏掉（flexlayer 0.2.20）。
 */
export function glyphAt(g: Glyph, p: GlyphPose, attrs: Record<string, string | number | undefined> = {}): FvgNode | null {
  const o = p.opacity ?? 1
  if (o <= 0.002 || !g.d) return null
  const s = p.scale ?? 1
  return h(
    'layer',
    {
      x: r2(p.x),
      y: r2(p.y),
      anchor: 'center',
      width: r2(g.width),
      height: r2(g.height),
      rotate: p.rotate ? r2(p.rotate) : undefined,
      scale: s !== 1 ? Math.round(s * 10000) / 10000 : undefined,
      opacity: o < 1 ? Math.round(o * 1000) / 1000 : undefined,
    },
    h('path', { d: g.d, fill: p.fill ?? C.paper, stroke: 'none', ...attrs }),
  )
}

/** 字身中心在 p、半径约 r 的字有没有伸出画布。用来决定这一帧要不要写 overflow-canvas 的 expect。 */
export const offCanvas = (p: { x: number; y: number; scale?: number }, r = 36) => {
  const k = r * (p.scale ?? 1)
  return p.x - k < 0 || p.x + k > W || p.y - k < 0 || p.y + k > H
}

/** 整幅画布大小的一层，放 glyphAt 摆好的字。 */
export const sheet = (attrs: Record<string, string | number | undefined>, ...children: Child[]) =>
  h('layer', { width: W, height: H, ...attrs }, ...children)

/** 字形路径的总长，给 stroke-dasharray 写字用。曲线按折线近似，误差在 1% 以内。 */
export function pathLength(d: string): number {
  const tok = d.match(/[MLQCZmlqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let len = 0
  const n = () => Number(tok[i++])
  const seg = (nx: number, ny: number) => {
    len += Math.hypot(nx - x, ny - y)
    x = nx
    y = ny
  }
  while (i < tok.length) {
    if (/[a-z]/i.test(tok[i]!)) cmd = tok[i++]!.toUpperCase()
    if (cmd === 'M') {
      x = sx = n()
      y = sy = n()
      cmd = 'L'
    } else if (cmd === 'L') seg(n(), n())
    else if (cmd === 'Q' || cmd === 'C') {
      const pts = cmd === 'Q' ? [n(), n(), n(), n()] : [n(), n(), n(), n(), n(), n()]
      const [x0, y0] = [x, y]
      for (let k = 1; k <= 8; k++) {
        const u = k / 8
        const v = 1 - u
        if (cmd === 'Q') seg(v * v * x0 + 2 * v * u * pts[0]! + u * u * pts[2]!, v * v * y0 + 2 * v * u * pts[1]! + u * u * pts[3]!)
        else
          seg(
            v * v * v * x0 + 3 * v * v * u * pts[0]! + 3 * v * u * u * pts[2]! + u * u * u * pts[4]!,
            v * v * v * y0 + 3 * v * v * u * pts[1]! + 3 * v * u * u * pts[3]! + u * u * u * pts[5]!,
          )
      }
    } else if (cmd === 'Z') {
      seg(sx, sy)
      if (i < tok.length && !/[a-z]/i.test(tok[i]!)) i++
    } else i++
  }
  return len
}

// ---------------------------------------------------------------- 每段都有的画面元素

type Chapter = { api: string; note: string }

/** 每段左上角：这一段用到的 flexlayer 能力，以及换成网页或手写 canvas 卡在哪。 */
const CHAPTERS: Partial<Record<Id, Chapter>> = {
  glyphs: { api: 'glyph() · canvas.create()', note: '网页要拆成 span 再量 DOM；手写 canvas 没有排版' },
  reflow: { api: 'canvas.create() · writing-mode', note: '逐字过渡要先排好两套版面，再一个字一个字对上' },
  stroke: { api: 'ink-stroke', note: 'CSS 描边压在笔画中线上，几个字也合不成一圈' },
  glass: { api: 'glass', note: 'backdrop-filter 只会模糊，折射要自己写着色器' },
  solid: { api: 'extrude · perspective', note: '网页要 three.js，还要把中文字体转成几何体' },
  camera: { api: 'origin="x y" · canvas.create()', note: '网页要先渲染一遍，量出目标的位置再推镜' },
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

/** 字幕：念过的字亮，没念到的暗。 */
export function subtitle(f: Frame): Child {
  const c = vo.caption(f.t)
  if (!c) return null
  const a = fade(f.t, c.line.from, c.line.to, 0.25, 0.25)
  const said = c.word ? Math.max(c.word.end, c.spoken) : c.spoken
  return place(
    { x: W / 2, y: 1000, opacity: a, id: 'subtitle' },
    h(
      'p',
      { style: 'white-space:nowrap; font-size:44px; letter-spacing:0.02em' },
      h('span', { style: `color:${C.paper}` }, c.line.text.slice(0, said)),
      h('span', { style: `color:${rgba(C.paper, 0.38)}` }, c.line.text.slice(said)),
    ),
  )
}

/** 印章：红底竖排两个字。片头盖一次，片尾再盖一次。 */
export function seal(x: number, y: number, k: number, rotate: number): Child {
  if (k <= 0.002) return null
  const s = 1 + 0.9 * (1 - Math.min(1, k))
  return place(
    { x, y, scale: s, rotate, opacity: Math.min(1, k * 3), id: 'seal' },
    h(
      'div',
      { style: `width:132px; height:132px; border-radius:16px; background:${C.red}; display:flex; align-items:center; justify-content:center` },
      h('p', { style: `writing-mode:vertical-rl; font-family:Kai; font-weight:700; font-size:50px; color:${C.paper}; letter-spacing:2px` }, '着墨'),
    ),
  )
}
