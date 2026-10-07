/**
 * 镜头、报告、收尾。
 *
 *   镜头  上一段停在正中的“墨”，其实是这一页里的一个字，只是放大了 15 倍。镜头拉远，整页露出来；
 *         说到“这里”时推向另一处。两处位置都是 canvas.create 量出来的，镜头只用一层 layer 的 origin。
 *   报告  推到“这里”之后，画出这两个字的盒子（蓝）和着墨（红）。接着三行字左对齐，
 *         报告里的数字说明各自的字形离盒子左边多远；说到“着墨”时按着墨对齐。
 *   收尾  三个名字依次出现，一条时间轴把它们串起来，印章盖在线的末端。
 */
import { canvas, checkFvg, glyph, h, type FvgReport, type PlacedLine } from 'flexlayer'
import {
  camera,
  fade,
  fx,
  lerp,
  place,
  progress,
  reveal,
  rgba,
  spring,
  text,
  type Child,
  type Frame,
} from 'motionflexlayer'
import { at, C, glyphAt, H, L, LATIN, seal, W } from './kit.js'

// ---------------------------------------------------------------- 一页文字

const COL1_A = 'flexlayer 把一帧画面写成一棵节点树：layer 负责定位，display:flex 负责排布，文字照 HTML 的写法。每次渲染先排版、再绘制，同时交出一份报告，里面有每个元素的盒子和着'
const COL1_B = '迹，以及越界、重叠、字号太小这些问题。动画就是按时间生成很多帧，每一帧都重新排版。'
const COL2 = 'motionflexlayer 在这棵树外面加了一条时间轴。旁白先念出来，每段的长短跟着旁白走；visualtone 按同一条时间轴合成音乐，人声一开口，伴奏就让出频段。画面里的动作都卡在旁白的词上，改一句文案，画面和声音一起重新对齐。'
const COL3_A = '镜头推近时，不需要先把画面渲染成位图。目标点由排版算出：先量出这一页，找到要看的字，再把这一点写成 layer 的 origin，缩放绕着它进行。你现在看的，就是'
const COL3_B = '。往后每一帧，仍然有自己的报告。'

const PAGE_W = 1680
const COL_W = 500
const BODY = `font-family:Kai; font-size:34px; line-height:1.75; color:${C.paper}; width:${COL_W}px`

function pageNode(hereColor: string) {
  return h(
    'layer',
    { width: PAGE_W },
    h(
      'div',
      { style: 'display:flex; flex-direction:column; align-items:flex-start; gap:36px' },
      h('h2', { style: `font-family:Kai; font-size:56px; color:${C.paper}` }, '排版报告 · 第七页'),
      h(
        'div',
        { style: `display:flex; gap:${(PAGE_W - 3 * COL_W) / 2}px; align-items:flex-start` },
        h('p', { style: BODY }, COL1_A, h('span', { style: `color:${C.red}; font-weight:700` }, '墨'), COL1_B),
        h('p', { style: BODY }, COL2),
        h('p', { style: BODY }, COL3_A, h('span', { style: `color:${hereColor}; font-weight:700` }, '这里'), COL3_B),
      ),
    ),
  )
}

const measured = canvas.create(pageNode(C.gold))
const PX = (W - PAGE_W) / 2
const PY = H / 2 - measured.height / 2 - 20

type Cell = { line: PlacedLine; x: number; width: number }

/** 在第 n 段文字里找 context，返回其中从第 skip 个字起的 count 个格子。折行处的空格不占格，所以按文字找，不按序号数。 */
function cells(n: number, context: string, skip: number, count: number): Cell[] {
  const all: Cell[] = []
  let joined = ''
  for (const line of measured.text[n]!.lines) {
    for (const c of line.chars) {
      all.push({ line, x: c.x, width: c.width })
      joined += c.text
    }
  }
  const at = joined.indexOf(context)
  if (at < 0) throw new Error(`第 ${n} 段里没有“${context}”`)
  return all.slice(at + skip, at + skip + count)
}

const MO_SMALL = (await glyph('墨', { font: 'Kai', size: 34, weight: 700 }))[0]!
const HERE = await glyph('这里', { font: 'Kai', size: 34, weight: 700 })

const moCell = cells(1, '着墨迹', 1, 1)[0]!
const MO_AT = {
  x: PX + moCell.x + MO_SMALL.width / 2,
  y: PY + moCell.line.baseline - MO_SMALL.baseline + MO_SMALL.height / 2,
}
const hereCells = cells(3, '就是这里', 2, 2)
/** “这里”两个字的盒子和着墨，页面坐标。 */
const HERE_BOX = {
  x: PX + hereCells[0]!.x,
  y: PY + hereCells[0]!.line.y,
  w: hereCells[1]!.x + hereCells[1]!.width - hereCells[0]!.x,
  h: hereCells[0]!.line.height,
}
const HERE_INK = (() => {
  const boxes = hereCells.map((c, j) => {
    const g = HERE[j]!
    const top = PY + c.line.baseline - g.baseline
    return { l: PX + c.x + g.ink!.x, t: top + g.ink!.y, r: PX + c.x + g.ink!.x + g.ink!.width, b: top + g.ink!.y + g.ink!.height }
  })
  const l = Math.min(...boxes.map((b) => b.l))
  const t = Math.min(...boxes.map((b) => b.t))
  return { x: l, y: t, w: Math.max(...boxes.map((b) => b.r)) - l, h: Math.max(...boxes.map((b) => b.b)) - t }
})()
const HERE_AT = { x: HERE_BOX.x + HERE_BOX.w / 2, y: HERE_BOX.y + HERE_BOX.h / 2 }
const PAGE_AT = { x: W / 2, y: H / 2 }

/** 上一段的“墨”字号 520，这一页里是 34：镜头从 520/34 倍开始。 */
const Z0 = 520 / MO_SMALL.size
const Z_HERE = 5.2

export const T_PULL = at('camera', '镜头')
const T_PULL_END = at('camera', '一点') + 0.35
export const T_PUSH = at('camera', '文字') - 0.15
export const T_HERE = at('camera', '这里')
const T_PUSH_END = T_HERE + 0.45
const T_BOXES = T_PUSH_END + 0.35

/** 镜头：缩放按对数插值，目标点和缩放用同一条缓动，推拉时画面里的运动是匀的。 */
function shot(t: number) {
  const pull = progress(t, T_PULL, T_PULL_END, 'inOutCubic')
  const push = progress(t, T_PUSH, T_PUSH_END, 'inOutQuart')
  const drift = progress(t, T_PULL_END, T_PUSH, 'inOutSine')
  const logZ = lerp(lerp(Math.log(Z0), Math.log(1.0), pull) + Math.log(1.04) * drift, Math.log(Z_HERE), push)
  const from = { x: lerp(MO_AT.x, PAGE_AT.x, pull), y: lerp(MO_AT.y, PAGE_AT.y, pull) }
  const x = lerp(from.x - 18 * drift, HERE_AT.x, push)
  const y = lerp(from.y, HERE_AT.y, push)
  const rotate = 3 * Math.sin(Math.PI * pull) * (1 - push) - 4 * Math.sin(Math.PI * push)
  // 段尾穿进“这里”：最后 0.45 秒再放大 3 倍，同时淡出，报告从稍大的尺寸落回原位接上这股推力
  const through = Math.exp(Math.log(3) * progress(t, L.camera.to - 0.45, L.camera.to, 'inCubic'))
  return { x, y, zoom: (Math.exp(logZ) + 0.25 * progress(t, T_PUSH_END, L.camera.to + 0.6)) * through, rotate }
}

const toScreen = (s: ReturnType<typeof shot>, p: { x: number; y: number }) => ({ x: (p.x - s.x) * s.zoom + W / 2, y: (p.y - s.y) * s.zoom + H / 2 })

function cameraScene(f: Frame): Child[] {
  const t = f.t
  if (t < L.camera.from - 0.02 || t > L.camera.to) return []
  const s = shot(t)
  const pageIn = progress(t, L.camera.from + 0.05, L.camera.from + 0.7, 'inOutSine')
  const glowHere = fade(t, T_HERE - 0.1, L.camera.to + 1, 0.25, 0.3)
  const focus = progress(t, T_PUSH, T_PUSH_END, 'inOutSine')
  const out = progress(t, L.camera.to - 0.45, L.camera.to, 'inOutSine')
  const world: Child[] = [
    glowHere > 0
      ? fx({ x: HERE_BOX.x + HERE_BOX.w / 2, y: HERE_BOX.y + HERE_BOX.h / 2, width: HERE_BOX.w + 40, height: HERE_BOX.h + 20, name: 'here-mark' }, (ctx) => {
          ctx.fillStyle = rgba(C.gold, 0.18 * glowHere)
          ctx.beginPath()
          ctx.roundRect(0, 0, HERE_BOX.w + 40, HERE_BOX.h + 20, 10)
          ctx.fill()
        })
      : null,
    place({ x: PX, y: PY, anchor: 'top-left', opacity: pageIn, id: 'page', attrs: { expect: 'min-font-size: 远景里的小字，推近后放大; overflow-canvas: 推近时出画; outside-safe: 推近时出画; text-overlap: 推近后正文从标签和字幕底下经过' } }, pageNode(C.gold)),
    pageIn < 1 ? glyphAt(MO_SMALL, { ...MO_AT, fill: C.red }) : null,
  ]
  return [
    h(
      'layer',
      {
        width: W,
        height: H,
        id: 'focus',
        opacity: out > 0 ? (1 - out).toFixed(3) : undefined,
        grade: focus > 0.01 ? `mono ${(0.8 * focus).toFixed(2)}, vignette ${(0.55 * focus).toFixed(2)}` : undefined,
        'grade-mask': focus > 0.01 ? 'radial-gradient(#fff0 28%, #fff 72%)' : undefined,
      },
      camera({ width: W, height: H, x: s.x, y: s.y, zoom: s.zoom, rotate: s.rotate }, ...world),
    ),
    ...boxes(t, s),
  ]
}

/** 推到“这里”之后：盒子（蓝）和着墨（红）。同一份报告里的两种矩形。 */
function boxes(t: number, s: ReturnType<typeof shot>): Child[] {
  const a = fade(t, T_BOXES, L.camera.to, 0.2, 0.4)
  if (a <= 0) return []
  const draw = progress(t, T_BOXES, T_BOXES + 0.6, 'outCubic')
  const rect = (r: { x: number; y: number; w: number; h: number }) => {
    const p = toScreen(s, r)
    return { x: p.x, y: p.y, w: r.w * s.zoom, h: r.h * s.zoom }
  }
  const b = rect(HERE_BOX)
  const k = rect(HERE_INK)
  const through = t > L.camera.to - 0.45 ? { expect: 'text-overlap: 穿进“这里”时标签跟着放大，从左上角的标签底下经过' } : undefined
  return [
    fx({ width: W, height: H, name: 'here-boxes' }, (ctx) => {
      ctx.globalAlpha = a
      ctx.lineWidth = 3
      const per = (r: { w: number; h: number }) => 2 * (r.w + r.h)
      ctx.setLineDash([12, 10])
      ctx.strokeStyle = C.blue
      ctx.lineDashOffset = 0
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.setLineDash([per(k) * draw, per(k)])
      ctx.strokeStyle = C.red
      ctx.strokeRect(k.x, k.y, k.w, k.h)
    }),
    place({ x: b.x, y: b.y - 14, anchor: 'bottom-left', opacity: a, attrs: through }, text('box', { fontFamily: LATIN, fontSize: 44, color: C.blue })),
    place({ x: k.x + k.w, y: k.y + k.h + 14, anchor: 'top-right', opacity: a * draw }, text('ink', { fontFamily: LATIN, fontSize: 44, color: C.red })),
  ]
}

// ---------------------------------------------------------------- 报告：按着墨对齐

const GUIDE = 300
const SPECIMENS = [
  { id: 's0', y: 250, style: 'font-family:Kai; font-weight:700; font-size:150px', text: '「着墨」' },
  { id: 's1', y: 460, style: 'font-family:Playfair; font-weight:700; font-size:150px', text: 'Typeset' },
  { id: 's2', y: 670, style: 'font-family:Playfair; font-weight:700; font-size:150px', text: '1984' },
]
const specimen = (sp: (typeof SPECIMENS)[number], x: number) =>
  h('layer', { id: sp.id, x: x.toFixed(2), y: sp.y }, h('p', { style: `white-space:nowrap; ${sp.style}; color:${C.paper}` }, sp.text))

/** 先排一遍，报告里每行的 box 和 ink 就是下面动画用的数。 */
const REPORT: FvgReport = await checkFvg(h('layer', { width: W, height: H }, ...SPECIMENS.map((sp) => specimen(sp, GUIDE))))
const MEASURE = SPECIMENS.map((sp) => {
  const e = REPORT.elements.find((x) => x.id === sp.id)!
  return { box: e.box, ink: e.ink!, inset: e.ink!.left - e.box.left }
})

const T_TABLE = at('report', '报告')
export const T_SNAP = at('report', '着墨')
export const SNAPS = SPECIMENS.map((_, i) => T_SNAP + i * 0.14)
const T_BOXWORD = at('report', '盒子')

function reportScene(f: Frame): Child[] {
  const t = f.t
  const a = fade(t, L.report.from - 0.1, L.report.to + 0.1, 0.35, 0.5)
  if (a <= 0) return []
  const snap = SNAPS.map((s) => spring(t - s, { damping: 14, stiffness: 160 }))
  const xs = MEASURE.map((m, i) => GUIDE - m.inset * snap[i]!)
  const lineK = progress(t, L.report.from, L.report.from + 0.7, 'outCubic')
  const outline = progress(t, T_TABLE - 0.2, T_TABLE + 0.5, 'outCubic')
  const boxFade = 1 - 0.65 * progress(t, T_BOXWORD, T_BOXWORD + 0.5)
  const zoomIn = 1 + 0.12 * (1 - progress(t, L.report.from, L.report.from + 0.7, 'outCubic'))
  const rows = MEASURE.map((m, i) => {
    const on = progress(t, T_TABLE + i * 0.22, T_TABLE + i * 0.22 + 0.3)
    const dx = xs[i]! - GUIDE
    const red = snap[i]! > 0.02
    return box3(
      on,
      text(SPECIMENS[i]!.id, { fontFamily: LATIN, fontSize: 44, color: C.dim, width: 90 }),
      text((m.box.left + dx).toFixed(1), { fontFamily: LATIN, fontSize: 44, color: C.blue, width: 200 }),
      text((m.ink.left + dx).toFixed(1), { fontFamily: LATIN, fontSize: 44, color: red ? C.red : C.paper, width: 200 }),
    )
  })
  return [
    place(
      { x: W / 2, y: H / 2, width: W, height: H, opacity: a, scale: zoomIn, id: 'report', attrs: zoomIn > 1.001 ? { expect: 'overflow-canvas: 从稍大的尺寸落回原位' } : undefined },
      fx({ width: W, height: H, name: 'report-lines' }, (ctx) => {
        ctx.strokeStyle = C.red
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(GUIDE, 210)
        ctx.lineTo(GUIDE, 210 + 660 * lineK)
        ctx.stroke()
        if (outline <= 0) return
        MEASURE.forEach((m, i) => {
          const dx = xs[i]! - GUIDE
          ctx.lineWidth = 2
          ctx.setLineDash([10, 8])
          ctx.strokeStyle = rgba(C.blue, outline * boxFade)
          ctx.strokeRect(m.box.left + dx, m.box.top, m.box.width, m.box.height)
          ctx.setLineDash([])
          ctx.strokeStyle = rgba(C.red, outline)
          ctx.strokeRect(m.ink.left + dx, m.ink.top, m.ink.width, m.ink.height)
        })
      }),
      ...SPECIMENS.map((sp, i) => specimen(sp, xs[i]!)),
      place(
        { x: 1160, y: 330, anchor: 'top-left' },
        h(
          'div',
          { style: 'display:flex; flex-direction:column; align-items:flex-start; gap:18px' },
          box3(progress(t, T_TABLE - 0.3, T_TABLE), text('id', { fontFamily: LATIN, fontSize: 44, color: C.dim, width: 90 }), text('box.x', { fontFamily: LATIN, fontSize: 44, color: C.dim, width: 200 }), text('ink.x', { fontFamily: LATIN, fontSize: 44, color: C.dim, width: 200 })),
          ...rows,
          box3(progress(t, T_BOXWORD + 0.3, T_BOXWORD + 0.8), text('anchor-box="ink"', { fontFamily: LATIN, fontSize: 46, color: C.red })),
        ),
      ),
    ),
  ]
}

const box3 = (opacity: number, ...kids: Child[]) =>
  h('div', { style: `display:flex; gap:24px; align-items:baseline; opacity:${Math.round(opacity * 1000) / 1000}` }, ...kids)

// ---------------------------------------------------------------- 收尾

const NAMES = [
  { name: 'flexlayer', role: '排版 · 绘制', word: 'flexlayer' },
  { name: 'visualtone', role: '配乐', word: 'visualtone' },
  { name: 'motionflexlayer', role: '时间轴', word: 'motionflexlayer' },
]
export const NAME_TIMES = NAMES.map((n) => at('outro', n.word))
const T_LINE = at('outro', '同')
export const T_END_SEAL = at('outro', '轴上') + 0.25

function outroScene(f: Frame): Child[] {
  const t = f.t
  if (t < L.outro.from - 0.2) return []
  const end = 1 - progress(t, L.outro.to - 1.3, L.outro.to - 0.1, 'inOutSine')
  const x0 = 520
  const out: Child[] = NAMES.map((n, i) => {
    const t0 = NAME_TIMES[i]! - 0.1
    const k = progress(t, t0, t0 + 0.6, 'outCubic')
    if (k <= 0) return null
    const rise = spring(t - t0, { damping: 18, stiffness: 140 })
    return place(
      { x: x0, y: 300 + i * 140 + 24 * (1 - rise), anchor: 'left', opacity: end },
      reveal(
        { progress: k, width: 1100, height: 130 },
        h(
          'div',
          { style: 'display:flex; gap:36px; align-items:baseline; height:130px' },
          text(n.name, { fontFamily: LATIN, fontWeight: 700, fontSize: 100, color: C.paper }),
          text(n.role, { fontSize: 46, color: C.dim }),
        ),
      ),
    )
  })
  const line = progress(t, T_LINE, T_LINE + 0.9, 'inOutCubic')
  if (line > 0)
    out.push(
      fx({ width: W, height: H, name: 'timeline' }, (ctx) => {
        ctx.globalAlpha = end
        ctx.strokeStyle = C.red
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(x0, 760)
        ctx.lineTo(x0 + 860 * line, 760)
        ctx.stroke()
        NAME_TIMES.forEach((_, i) => {
          const x = x0 + i * 430
          const on = spring(t - T_LINE - (0.9 * (x - x0)) / 860, { damping: 10, stiffness: 300 })
          if (on <= 0) return
          ctx.fillStyle = C.red
          ctx.beginPath()
          ctx.arc(x, 760, 9 * Math.max(0, on), 0, Math.PI * 2)
          ctx.fill()
        })
      }),
    )
  const k = progress(t, T_END_SEAL - 0.16, T_END_SEAL, 'inQuad')
  const settle = 1 - 0.05 * Math.sin(Math.PI * progress(t, T_END_SEAL, T_END_SEAL + 0.2))
  if (k > 0) out.push(place({ x: 0, y: 0, anchor: 'top-left', opacity: end }, seal(x0 + 860 + 110, 760, k * settle, -6)))
  return out
}

export function pageScenes(f: Frame): Child[] {
  return [...cameraScene(f), ...reportScene(f), ...outroScene(f)]
}
