import {
  applyCanvasFont,
  createCanvas as createFlexCanvas,
  DEFAULT_FONT_FAMILY,
  initFonts,
  loadImage as loadFlexImage,
  registerFontPath,
  type SKRSContext2D,
} from 'flexlayer'

/** flexlayer 的默认字体。离屏测量和绘制用 applyCanvasFont，字重才会进可变字体的 wght 轴。 */
export const DEFAULT_FONT = DEFAULT_FONT_FAMILY

export { applyCanvasFont, initFonts, DEFAULT_FONT_FAMILY }

/** 绘图上下文。flexlayer 导出的是 napi 的完整 2D 类型，包含 drawImage。 */
export type Canvas2D = SKRSContext2D

export type OffscreenCanvas = {
  width: number
  height: number
  getContext(type: '2d'): Canvas2D
  toBuffer(mime: 'image/png'): Buffer
}

export type LoadedImage = { width: number; height: number }

/** 和 flexlayer 排版同一份画布。 */
export function createCanvas(width: number, height: number): OffscreenCanvas {
  return createFlexCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)))
}

export function loadImage(src: string | Buffer): Promise<LoadedImage> {
  return loadFlexImage(src)
}

/** 注册自定义字体文件。同名再注册不会换掉 flexlayer 已经记住的文件。 */
export function registerFont(path: string, family?: string): void {
  const name = family?.trim()
  if (!name) throw new Error('registerFont 需要 family，自定义文件用新的字体名')
  registerFontPath(name, path)
}

/** 下载并注册默认字体，再按名字准备目录里的字体。下载失败或名字没登记会抛出。 */
export function ensureFonts(families?: Iterable<string>): Promise<void> {
  return initFonts(families)
}
