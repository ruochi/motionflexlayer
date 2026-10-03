import { renderFvg, type FvgNode, type FvgReport, type RenderOptions } from '@dc/flexlayer'
import { createCanvas } from '../canvas.js'

export type RawFrame = { rgba: Buffer; width: number; height: number; report: FvgReport }

type CanvasProto = { toBuffer(this: CanvasLike, mime: string, ...rest: unknown[]): Buffer }
type CanvasLike = CanvasProto & { width: number; height: number; data(): Buffer }

const EMPTY = Buffer.alloc(0)
let capture: { frame?: { rgba: Buffer; width: number; height: number } } | undefined
let patched = false

/**
 * 临时垫片：PNG 编码占单帧耗时的 80–95%，视频管线不需要它。
 * 渲染期间拦截 flexlayer 对最终画布的 toBuffer('image/png')，直接取 RGBA 像素。
 * flexlayer 支持 format: 'raw' 后删除（docs/FLEXLAYER-CHANGES.md 第 8 项）。
 */
function patch(): void {
  if (patched) return
  patched = true
  const proto = Object.getPrototypeOf(createCanvas(1, 1)) as CanvasProto
  const original = proto.toBuffer
  proto.toBuffer = function (this: CanvasLike, mime: string, ...rest: unknown[]) {
    if (!capture || mime !== 'image/png') return original.call(this, mime, ...rest)
    capture.frame = { rgba: this.data(), width: this.width, height: this.height }
    return EMPTY
  }
}

/** 渲染一帧，返回 RGBA（预乘 alpha，背景不透明时与 PNG 一致）。不可并发调用。 */
export async function renderRaw(node: FvgNode, opts: RenderOptions): Promise<RawFrame> {
  patch()
  capture = {}
  try {
    const { report } = await renderFvg(node, opts)
    const frame = capture.frame
    if (!frame) throw new Error('没有捕获到画布像素（flexlayer 的输出方式变了？）')
    return { ...frame, report }
  } finally {
    capture = undefined
  }
}
