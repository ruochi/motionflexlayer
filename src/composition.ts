import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { h, type FvgChild, type FvgNode } from 'flexlayer'
import { AudioFrame, type Envelopes } from './audio/envelopes.js'
import type { AudioSpec } from './audio/types.js'
import { ensureFonts } from './canvas.js'
import { Timeline, type SectionState } from './timeline.js'
import { subtitleAt, type SubtitleNow, type SubtitleTrack } from './voice/narration.js'

/** 帧函数拿到的一切。t 是唯一的真相，其余都由 t 推出。 */
export type Frame = {
  /** 当前时间，秒。 */
  t: number
  /** 帧号。只用来显示，动画一律用 t。 */
  frame: number
  fps: number
  width: number
  height: number
  duration: number
  /** t / duration。 */
  progress: number
  tl: Timeline
  /** 当前第几拍，小数。 */
  beat: number
  /** 当前所在段落。没有登记段落时为 undefined。 */
  section?: SectionState
  /** 音轨读数（电平、起音）。只有合成写了 envelopes: true 才有。 */
  audio?: AudioFrame
  /**
   * 这一帧的字幕。只有合成写了 `subtitles` 才有。
   * 每个字带自己的时间和进度，没有颜色、字号、位置。
   */
  subtitle?: SubtitleNow
}

export type RenderOutput = FvgChild | null | undefined | false | readonly RenderOutput[]

export type LintProfile = {
  /** 视频里可以接受的问题码。见 MOTION.md 的问题码表。 */
  ignore?: string[]
}

export type CompositionSpec = {
  /** 输出文件名的前缀。缺省用入口文件名。 */
  id?: string
  width: number
  height: number
  /** 默认 60。 */
  fps?: number
  /** 秒。 */
  duration: number
  /** 画布底色。只有根 layer 能填背景。 */
  background?: string
  /** 默认文字颜色。 */
  color?: string
  /** 根 layer 上的其它属性，例如 safe、grade、font-family。 */
  root?: Record<string, string | number>
  timeline?: Timeline
  audio?: AudioSpec | ((ctx: { tl: Timeline; duration: number }) => AudioSpec | Promise<AudioSpec>)
  /**
   * 画面要跟着声音动时设 true：渲染前先混一遍音，帧函数里用 f.audio 读各母线的电平和起音。
   * 包络只算一次，多进程渲染时由主进程算好发给 worker。
   */
  envelopes?: boolean
  lint?: LintProfile
  /** 相对路径（图片、音频文件）的基准目录。CLI 加载时缺省为入口文件所在目录。 */
  baseDir?: string
  /** 每个进程开始渲染前调用一次。放预计算：粒子模拟、文字采样、读数据。 */
  setup?: () => void | Promise<void>
  /**
   * 字幕轨。逐字时间，没有样式。`render` 里从 `f.subtitle` 读，想怎么画就怎么画。
   * `subs` 和 `render` 会把它写成 `.vtt`（一句一条）和 `.subs.json`（逐字）。
   */
  subtitles?: SubtitleTrack
  /** t → 画面。必须是纯函数：同一个 t 永远给出同一帧。 */
  render: (f: Frame) => RenderOutput | Promise<RenderOutput>
}

export type Composition = Readonly<CompositionSpec & { fps: number; tl: Timeline }> & {
  readonly kind: 'motionflexlayer.composition'
}

export function defineComposition(spec: CompositionSpec): Composition {
  if (!(spec.width > 0 && spec.height > 0)) throw new Error('width / height 必须大于 0')
  if (!(spec.duration > 0)) throw new Error('duration 必须大于 0，单位秒')
  const tl = spec.timeline ?? new Timeline()
  if (!(tl.duration > 0)) tl.duration = spec.duration
  return { ...spec, fps: spec.fps ?? 60, tl, kind: 'motionflexlayer.composition' }
}

export function isComposition(v: unknown): v is Composition {
  return typeof v === 'object' && v != null && (v as Composition).kind === 'motionflexlayer.composition'
}

export function totalFrames(comp: Composition): number {
  return Math.round(comp.duration * comp.fps)
}

const envelopeMap = new WeakMap<Composition, Envelopes>()

/** 注入算好的包络。worker 进程用它跳过混音。 */
export function setEnvelopes(comp: Composition, env: Envelopes): void {
  envelopeMap.set(comp, env)
}

export function envelopesOf(comp: Composition): Envelopes | undefined {
  return envelopeMap.get(comp)
}

export function frameAt(comp: Composition, t: number): Frame {
  const env = envelopeMap.get(comp)
  return {
    t,
    frame: Math.round(t * comp.fps),
    fps: comp.fps,
    width: comp.width,
    height: comp.height,
    duration: comp.duration,
    progress: t / comp.duration,
    tl: comp.tl,
    beat: comp.tl.beatAt(t),
    section: comp.tl.sectionAt(t),
    audio: env ? new AudioFrame(env, t) : undefined,
    subtitle: comp.subtitles ? subtitleAt(comp.subtitles, t) : undefined,
  }
}

const setupDone = new WeakMap<Composition, Promise<void>>()
const envelopesDone = new WeakMap<Composition, Promise<void>>()

/**
 * 每个进程渲染前调用一次：字体、setup，以及（envelopes: true 时）混一遍音拿包络。
 * 只混音时传 { envelopes: false }，避免混两遍。
 */
export function prepare(comp: Composition, opts: { envelopes?: boolean } = {}): Promise<void> {
  let p = setupDone.get(comp)
  if (!p) {
    p = ensureFonts().then(() => comp.setup?.())
    setupDone.set(comp, p)
  }
  if (!comp.envelopes || opts.envelopes === false || envelopeMap.has(comp)) return p
  let e = envelopesDone.get(comp)
  if (!e) {
    e = p.then(async () => {
      if (envelopeMap.has(comp)) return
      const { audioSpecOf, mixAudio } = await import('./audio/mixer.js')
      const spec = await audioSpecOf(comp)
      if (!spec) throw new Error('envelopes: true 需要合成定义 audio')
      const mix = await mixAudio(spec, { duration: comp.duration, baseDir: comp.baseDir, envelopeFps: comp.fps })
      envelopeMap.set(comp, mix.envelopes!)
    })
    envelopesDone.set(comp, e)
  }
  return e
}

export function flatten(out: RenderOutput, into: FvgChild[] = []): FvgChild[] {
  if (out == null || out === false) return into
  if (Array.isArray(out)) {
    for (const o of out as readonly RenderOutput[]) flatten(o, into)
    return into
  }
  into.push(out as FvgChild)
  return into
}

/** 某一时刻的完整文档：根 layer 由框架生成，帧函数只管内容。 */
export async function nodeAt(comp: Composition, t: number): Promise<FvgNode> {
  await prepare(comp)
  const children = flatten(await comp.render(frameAt(comp, t)))
  return h(
    'layer',
    {
      width: comp.width,
      height: comp.height,
      background: comp.background,
      color: comp.color,
      ...comp.root,
    },
    ...children,
  )
}

/** 按路径加载合成。入口模块 `export default defineComposition(...)`，或用 exportName 指定。 */
export async function loadComposition(entry: string, exportName = 'default'): Promise<Composition> {
  const abs = resolve(entry)
  const mod = (await importModule(abs)) as Record<string, unknown>
  const comp = mod[exportName]
  if (!isComposition(comp)) {
    throw new Error(`${entry} 的导出 ${exportName} 不是 defineComposition(...) 的结果`)
  }
  if (comp.baseDir) return comp
  return Object.freeze({ ...comp, baseDir: dirname(abs) }) as Composition
}

let tsxRegistered = process.execArgv.some((a) => a.includes('tsx'))

/**
 * TS 入口一律交给 tsx：Node 自带的类型剥离不会把 `./x.js` 解析到 `x.ts`，
 * 也不认 tsconfig 的 paths 和 jsxImportSource。
 */
async function importModule(abs: string): Promise<unknown> {
  if (!tsxRegistered && /\.[cm]?tsx?$/.test(abs)) {
    const { register } = await import('tsx/esm/api')
    register()
    tsxRegistered = true
  }
  return import(pathToFileURL(abs).href)
}
