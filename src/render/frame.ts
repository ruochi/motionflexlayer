import { renderFrames, renderFvg, type FvgNode, type FvgReport } from 'flexlayer'
import { nodeAt, type Composition } from '../composition.js'

export type FrameResult = {
  t: number
  png: Buffer
  report: FvgReport
  node: FvgNode
}

/** 渲染一帧。scale 是像素倍率，0.5 出半分辨率草稿。 */
export async function renderFrame(comp: Composition, t: number, opts: { scale?: number } = {}): Promise<FrameResult> {
  const node = await nodeAt(comp, t)
  const { png, report } = await renderFvg(node, {
    t,
    frame: Math.round(t * comp.fps),
    fps: comp.fps,
    scale: opts.scale ?? 1,
    baseDir: comp.baseDir,
  })
  return { t, png, report, node }
}

export type RgbaFrame = { rgba: Buffer; width: number; height: number; report: FvgReport }

/**
 * 渲染第 frame 帧，返回不预乘的 RGBA，直接喂给编码器，省掉 PNG 编码。
 * 帧函数可以是异步的，所以先在这里求出文档，再交给 flexlayer 的 renderFrames。
 */
export async function renderRgba(comp: Composition, frame: number, opts: { scale?: number } = {}): Promise<RgbaFrame> {
  const node = await nodeAt(comp, frame / comp.fps)
  const frames = renderFrames(
    { id: comp.id ?? 'motionflexlayer', width: comp.width, height: comp.height, fps: comp.fps, durationInFrames: frame + 1, component: () => node },
    { from: frame, to: frame, format: 'rgba', scale: opts.scale ?? 1, baseDir: comp.baseDir },
  )
  const { value } = await frames.next()
  if (!value?.rgba) throw new Error(`第 ${frame} 帧没有输出像素`)
  return { rgba: value.rgba, width: value.width, height: value.height, report: value.report }
}
