import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderFvg, type DrawFn } from 'flexlayer'

/** flexlayer 的默认字体，可变字重。draw 里写 ctx.font 用它和画面其余文字一致。 */
export const DEFAULT_FONT = 'ChillDuanSans'

/** draw 回调拿到的 ctx 类型（@napi-rs/canvas 的 2D 上下文）。 */
export type Canvas2D = Parameters<DrawFn>[0]

export type OffscreenCanvas = {
  width: number
  height: number
  getContext(type: '2d'): Canvas2D
  toBuffer(mime: 'image/png'): Buffer
}

export type LoadedImage = { width: number; height: number }

type NapiCanvas = {
  createCanvas(width: number, height: number): OffscreenCanvas
  loadImage(src: string | Buffer): Promise<LoadedImage>
  GlobalFonts: { registerFromPath(path: string, family?: string): unknown }
}

function findPackageDir(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new Error(`找不到依赖 ${name}`)
}

let napi: NapiCanvas | undefined

/**
 * 和 flexlayer 共用同一份 @napi-rs/canvas。两份实例的字体注册表互不相通，
 * 自己再装一份会导致 draw 里量出来的字和 flexlayer 排版的字不一致。
 */
function canvasModule(): NapiCanvas {
  if (!napi) {
    const req = createRequire(join(findPackageDir('flexlayer'), 'package.json'))
    napi = req('@napi-rs/canvas') as NapiCanvas
  }
  return napi
}

/** 离屏画布。预计算（文字采样、噪声贴图、缓存的笔刷）用。 */
export function createCanvas(width: number, height: number): OffscreenCanvas {
  return canvasModule().createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)))
}

export function loadImage(src: string | Buffer): Promise<LoadedImage> {
  return canvasModule().loadImage(src)
}

/** 注册字体文件，draw 里可以用这个 family。markup 里的文字仍用 <font> 声明。 */
export function registerFont(path: string, family?: string): void {
  canvasModule().GlobalFonts.registerFromPath(path, family)
}

let fontsReady: Promise<void> | undefined

/** 确保默认字体已下载并注册。在 setup 里量字、采样文字之前调用。 */
export function ensureFonts(): Promise<void> {
  fontsReady ??= renderFvg('<layer width="1" height="1"></layer>').then(() => undefined)
  return fontsReady
}
