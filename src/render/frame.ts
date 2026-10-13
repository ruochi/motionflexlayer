import { renderLayer, type LayerNode, type LayerReport } from 'flexlayer'
import { nodeAt, type Composition } from '../composition.js'
import { setPaintClock } from '../paint.js'

export type FrameResult = {
  t: number
  png: Buffer
  report: LayerReport
  node: LayerNode
}

/** 渲染一帧。scale 是像素倍率，0.5 出半分辨率草稿。 */
export async function renderFrame(comp: Composition, t: number, opts: { scale?: number } = {}): Promise<FrameResult> {
  const node = await nodeAt(comp, t)
  const frame = Math.round(t * comp.fps)
  setPaintClock(frame, comp.fps)
  const { png, report } = await renderLayer(node, {
    t,
    frame,
    fps: comp.fps,
    scale: opts.scale ?? 1,
    baseDir: comp.baseDir,
  })
  return { t, png, report, node }
}

export type RgbaFrame = { rgba: Buffer; width: number; height: number; report: LayerReport }

/**
 * 渲染第 frame 帧，返回不预乘的 RGBA，直接喂给编码器，省掉 PNG 编码。
 * 帧函数可以是异步的，所以先求出文档，再交给 renderLayer。
 */
export async function renderRgba(comp: Composition, frame: number, opts: { scale?: number } = {}): Promise<RgbaFrame> {
  const t = frame / comp.fps
  const node = await nodeAt(comp, t)
  setPaintClock(frame, comp.fps)
  const { rgba, width, height, report } = await renderLayer(node, {
    format: 'rgba',
    t,
    frame,
    fps: comp.fps,
    scale: opts.scale ?? 1,
    baseDir: comp.baseDir,
  })
  return { rgba, width, height, report }
}
