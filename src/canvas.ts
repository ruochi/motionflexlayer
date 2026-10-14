import { basename, extname } from 'node:path'
import { createCanvas as flexCanvas, DEFAULT_FONT_FAMILY, initFonts, loadImage as flexLoadImage, registerFontPath, type SKRSContext2D } from 'flexlayer'

/** flexlayer 的默认字体，可变字重。draw 里写 ctx.font 用它和画面其余文字一致。 */
export const DEFAULT_FONT: string = DEFAULT_FONT_FAMILY

/** 绘图上下文。flexlayer 导出的是 napi 的完整 2D 类型，包含 drawImage。 */
export type Canvas2D = SKRSContext2D

export type OffscreenCanvas = {
  width: number
  height: number
  getContext(type: '2d'): Canvas2D
  toBuffer(mime: 'image/png'): Buffer
}

export type LoadedImage = { width: number; height: number }

/** 离屏画布。预计算（文字采样、噪声贴图、缓存的笔刷）用。和 flexlayer 排版共用同一份 canvas 和字体。 */
export function createCanvas(width: number, height: number): OffscreenCanvas {
  return flexCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)))
}

export function loadImage(src: string | Buffer): Promise<LoadedImage> {
  return flexLoadImage(src)
}

/** 注册字体文件，draw 里可以用这个 family。缺省用文件名。markup 里的文字仍用 <font> 声明。 */
export function registerFont(path: string, family = basename(path, extname(path))): void {
  registerFontPath(family, path)
}

let fontsReady: Promise<void> | undefined

/** 确保默认字体已下载并注册。在 setup 里量字、采样文字之前调用。 */
export function ensureFonts(): Promise<void> {
  fontsReady ??= initFonts()
  return fontsReady
}
