import { renderFvg, type FvgNode, type FvgReport } from '@dc/flexlayer'
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
  const { png, report } = await renderFvg(node, { t, scale: opts.scale ?? 1, baseDir: comp.baseDir })
  return { t, png, report, node }
}
