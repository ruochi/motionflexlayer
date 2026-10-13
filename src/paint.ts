import { h, type LayerNode, type SKRSContext2D } from 'flexlayer'

/** 和 flexlayer 0.5 之前的 draw 回调同一份快照。脚本宿主能读到的字段会填上。 */
export type DrawComputedStyle = {
  color: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  opacity: number
}

export type DrawEl = {
  tag: string
  id?: string
  text: string
  attr: Record<string, string>
  style: Record<string, string>
  computed: DrawComputedStyle
  /** 排版后的宽高，和 width / height 相同。 */
  w: number
  h: number
  width: number
  height: number
  data?: unknown
  /** 当前帧的时间，秒。 */
  t: number
  /** 当前帧号。单帧渲染缺省为 0。 */
  frame: number
  /** 每秒帧数。单帧渲染缺省为 0。 */
  fps: number
}

/** 在元素本地坐标里画。flexlayer 0.5 起由 `<canvas>` + `<script>` 执行，不再有 draw 属性。 */
export type DrawFn = (ctx: SKRSContext2D, el: DrawEl) => void

type PaintCanvas = {
  id: string
  width: number
  height: number
  getContext(type: '2d'): SKRSContext2D | null
  getBoundingClientRect(): { width: number; height: number }
}

let paintSeq = 0
let paintClock = { frame: 0, fps: 0 }

/** 渲染前写入帧号。脚本执行时读它，`el.t` 仍用这一帧的 `performance.now()`。 */
export function setPaintClock(frame: number, fps: number): void {
  paintClock = { frame, fps }
}

export type DrawSpec = {
  width: number
  height: number
  data?: unknown
  id?: string
  attr?: Record<string, string>
}

/**
 * 一块位图和执行 draw 的脚本。宽高是布局尺寸，也是位图尺寸。
 * 画布 id 只在这一进程里唯一，用来让脚本找到自己的那块画布。
 */
export function drawNodes(draw: DrawFn, spec: DrawSpec): LayerNode[] {
  const canvasId = `mfl-px-${++paintSeq}`
  const width = spec.width
  const height = spec.height
  const data = spec.data
  const id = spec.id
  const attr = spec.attr ?? {
    width: String(width),
    height: String(height),
    ...(id ? { id } : {}),
  }
  return [
    h('canvas', { id: canvasId, width, height }),
    h('script', null, () => {
      const canvas = document.getElementById(canvasId) as unknown as PaintCanvas | null
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      const w = rect.width || width
      const hh = rect.height || height
      const cs = getComputedStyle(canvas as unknown as Element)
      const { frame, fps } = paintClock
      draw(ctx, {
        tag: 'canvas',
        id,
        text: '',
        attr,
        style: {},
        computed: {
          color: cs.color,
          fontFamily: cs.fontFamily,
          fontSize: Number.parseFloat(cs.fontSize) || 16,
          fontWeight: Number(cs.fontWeight) || 400,
          opacity: Number(cs.opacity) || 1,
        },
        w,
        h: hh,
        width: w,
        height: hh,
        data,
        t: performance.now() / 1000,
        frame,
        fps,
      })
    }),
  ]
}
