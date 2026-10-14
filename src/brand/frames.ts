/**
 * 品牌片的画面闸门。取样渲染结果，量每一帧有没有东西、有没有边、有没有在动。
 * 次数可以垫，像素垫不了：一块空底加一行字，覆盖率和边缘都过不了。
 */

export type RgbaSample = {
  t: number
  width: number
  height: number
  rgba: Uint8Array | Buffer
}

export type ActSpan = { name: string; from: number; to: number }

export type FrameFloors = {
  /** 中位覆盖率：不是底色的像素占比。 */
  coverage: number
  /** 中位细节：和邻像素亮度差得开的像素占比。 */
  detail: number
  /** 中位运动：和上一张比，亮度差得开的像素占比。 */
  motion: number
  /** 最空的那一段的中位覆盖率。 */
  thinnest: number
  /** 几乎不动的最长一段时间，秒。 */
  still: number
}

/**
 * 下限对着这个渲染器的采样（缩小后的 RGBA、下面的阈值），
 * 卡在参考片下面、空画面上面。空底是 0；参考片见 examples/brand。
 */
export const FRAME_FLOORS: FrameFloors = {
  coverage: 0.06,
  detail: 0.008,
  motion: 0.007,
  thinnest: 0.035,
  still: 2.5,
}

const COVERAGE_DELTA = 28
const DETAIL_DELTA = 18
const MOTION_DELTA = 12
const STILL_MOTION = 0.008

export type FrameStats = {
  samples: number
  medianCoverage: number
  medianDetail: number
  medianMotion: number
  thinnest: { name: string; coverage: number }
  longestStill: number
  failed: string[]
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[i]! : (s[i - 1]! + s[i]!) / 2
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function coverageOf(px: Uint8Array | Buffer, width: number, height: number, ground: readonly [number, number, number]): number {
  const [gr, gg, gb] = ground
  let hit = 0
  const n = width * height
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const dr = px[o]! - gr
    const dg = px[o + 1]! - gg
    const db = px[o + 2]! - gb
    if (dr * dr + dg * dg + db * db > COVERAGE_DELTA * COVERAGE_DELTA) hit++
  }
  return n === 0 ? 0 : hit / n
}

function detailOf(px: Uint8Array | Buffer, width: number, height: number): number {
  let hit = 0
  let seen = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const o = (y * width + x) * 4
      const r = (y * width + x + 1) * 4
      const d = Math.abs(luma(px[o]!, px[o + 1]!, px[o + 2]!) - luma(px[r]!, px[r + 1]!, px[r + 2]!))
      if (d > DETAIL_DELTA) hit++
      seen++
    }
  }
  return seen === 0 ? 0 : hit / seen
}

function motionOf(a: Uint8Array | Buffer, b: Uint8Array | Buffer, width: number, height: number): number {
  const n = width * height
  let hit = 0
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const d = Math.abs(luma(a[o]!, a[o + 1]!, a[o + 2]!) - luma(b[o]!, b[o + 1]!, b[o + 2]!))
    if (d > MOTION_DELTA) hit++
  }
  return n === 0 ? 0 : hit / n
}

function actAt(acts: readonly ActSpan[], t: number): ActSpan | undefined {
  return acts.find((a, i) => t >= a.from - 1e-6 && (i === acts.length - 1 ? t <= a.to + 1e-6 : t < a.to - 1e-6))
}

/** 按时间升序的采样。第一张没有运动读数。acts 用来算最空的一段。 */
export function auditFrames(
  frames: readonly RgbaSample[],
  acts: readonly ActSpan[],
  ground: readonly [number, number, number],
  floors: FrameFloors = FRAME_FLOORS,
): FrameStats {
  const ordered = [...frames].sort((a, b) => a.t - b.t)
  const coverages: number[] = []
  const details: number[] = []
  const motions: number[] = []
  const byAct = new Map<string, number[]>()
  for (const act of acts) byAct.set(act.name, [])

  let longest = 0
  let run = 0
  for (let i = 0; i < ordered.length; i++) {
    const f = ordered[i]!
    const cov = coverageOf(f.rgba, f.width, f.height, ground)
    coverages.push(cov)
    details.push(detailOf(f.rgba, f.width, f.height))
    const act = actAt(acts, f.t)
    if (act) byAct.get(act.name)?.push(cov)
    if (i === 0) continue
    const prev = ordered[i - 1]!
    const motion =
      prev.width === f.width && prev.height === f.height ? motionOf(prev.rgba, f.rgba, f.width, f.height) : 1
    motions.push(motion)
    const dt = f.t - prev.t
    if (motion < STILL_MOTION) {
      run += dt
      longest = Math.max(longest, run)
    } else run = 0
  }

  let thinnest = { name: acts[0]?.name ?? '—', coverage: median(coverages) }
  for (const [name, xs] of byAct) {
    if (xs.length === 0) continue
    const c = median(xs)
    if (c < thinnest.coverage) thinnest = { name, coverage: c }
  }

  const medianCoverage = median(coverages)
  const medianDetail = median(details)
  const medianMotion = median(motions)
  const failed: string[] = []
  if (ordered.length < 2) failed.push('采样少于 2 帧，量不出运动')
  if (medianCoverage < floors.coverage) failed.push(`中位覆盖率 ${medianCoverage.toFixed(3)} < ${floors.coverage}`)
  if (medianDetail < floors.detail) failed.push(`中位细节 ${medianDetail.toFixed(3)} < ${floors.detail}`)
  if (medianMotion < floors.motion) failed.push(`中位运动 ${medianMotion.toFixed(3)} < ${floors.motion}`)
  if (thinnest.coverage < floors.thinnest) {
    failed.push(`最空的一段「${thinnest.name}」覆盖率 ${thinnest.coverage.toFixed(3)} < ${floors.thinnest}`)
  }
  if (longest > floors.still) failed.push(`近乎静止 ${longest.toFixed(2)}s > ${floors.still}s`)

  return {
    samples: ordered.length,
    medianCoverage,
    medianDetail,
    medianMotion,
    thinnest,
    longestStill: longest,
    failed,
  }
}

export function formatFrames(stats: FrameStats): string {
  const lines = [
    '画面闸门',
    `采样 ${stats.samples} 帧`,
    `覆盖率 ${stats.medianCoverage.toFixed(3)}    细节 ${stats.medianDetail.toFixed(3)}    运动 ${stats.medianMotion.toFixed(3)}`,
    `最空的一段 ${stats.thinnest.name} ${stats.thinnest.coverage.toFixed(3)}    最长静止 ${stats.longestStill.toFixed(2)}s`,
  ]
  for (const f of stats.failed) lines.push(`FAIL  ${f}`)
  lines.push(`${stats.failed.length} failed`)
  return lines.join('\n')
}
