import { createCanvas, DEFAULT_FONT } from '../canvas.js'
import type { Timeline } from '../timeline.js'
import type { Stereo } from './types.js'

export type LevelStat = { peak: number; rms: number }

export type AudioReport = LevelStat & {
  duration: number
  /** 被限幅器压过的采样比例。 */
  limited: number
  sections: Array<LevelStat & { name: string; from: number; to: number }>
  /** 每秒的 RMS，dBFS。 */
  perSecond: number[]
  /** 某个 cue 前后的电平跳变，dB。正数代表声音在这个点上“撞”进来。 */
  cues: Array<{ name: string; t: number; jump: number }>
}

const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -120)

function level(s: Stereo, a: number, b: number): LevelStat {
  let peak = 0
  let sum = 0
  const lo = Math.max(0, a)
  const hi = Math.min(s.l.length, b)
  for (let n = lo; n < hi; n++) {
    const l = s.l[n]!
    const r = s.r[n]!
    peak = Math.max(peak, Math.abs(l), Math.abs(r))
    sum += (l * l + r * r) / 2
  }
  const count = Math.max(1, hi - lo)
  return { peak: toDb(peak), rms: toDb(Math.sqrt(sum / count)) }
}

/** 电平报告：整体、分段、每秒、每个 cue 的瞬时跳变。 */
export function analyzeAudio(s: Stereo, sr: number, tl?: Timeline, limited = 0): AudioReport {
  const N = s.l.length
  const duration = N / sr
  const overall = level(s, 0, N)
  const perSecond: number[] = []
  for (let k = 0; k < Math.ceil(duration); k++) perSecond.push(Math.round(level(s, k * sr, (k + 1) * sr).rms * 10) / 10)
  const sections = (tl?.sections ?? []).map((sec) => ({
    name: sec.name,
    from: sec.from,
    to: sec.to,
    ...level(s, Math.round(sec.from * sr), Math.round(sec.to * sr)),
  }))
  const w = Math.round(0.05 * sr)
  const cues = (tl?.cues() ?? []).map((c) => {
    const n = Math.round(c.t * sr)
    return { name: c.name, t: c.t, jump: Math.round((level(s, n, n + w).rms - level(s, n - w, n).rms) * 10) / 10 }
  })
  return { ...overall, duration, limited, sections, perSecond, cues }
}

export function formatAudioReport(r: AudioReport, maxCues = 24): string {
  const f = (v: number) => v.toFixed(1).padStart(6)
  const lines = [
    `音频 ${r.duration.toFixed(2)}s  峰值 ${r.peak.toFixed(1)} dBFS  RMS ${r.rms.toFixed(1)} dBFS  限幅 ${(r.limited * 100).toFixed(2)}%`,
  ]
  if (r.limited > 0.01) lines.push('  ⚠ 限幅超过 1%：整体太响，降低母线或片段增益')
  if (r.sections.length) {
    lines.push('  段落            RMS    峰值')
    for (const s of r.sections) lines.push(`  ${s.name.padEnd(12)} ${f(s.rms)} ${f(s.peak)}   ${s.from.toFixed(2)}–${s.to.toFixed(2)}s`)
  }
  lines.push(`  每秒 RMS：${r.perSecond.map((v) => Math.round(v)).join(' ')}`)
  const quiet = r.cues.filter((c) => c.jump < 1)
  if (r.cues.length) {
    lines.push(`  cue 跳变（dB，>3 说明这个点上有明显的声音进来）：`)
    for (const c of r.cues.slice(0, maxCues)) lines.push(`    ${c.t.toFixed(2)}s ${c.name.padEnd(12)} ${c.jump >= 0 ? '+' : ''}${c.jump}`)
    if (r.cues.length > maxCues) lines.push(`    ……还有 ${r.cues.length - maxCues} 个`)
    if (quiet.length) lines.push(`  ${quiet.length} 个 cue 上几乎没有声音变化，检查是否漏了音效`)
  }
  return lines.join('\n')
}

/** 波形图：RMS 包络 + 段落、cue 标记。看一眼就知道声音的起伏是否跟画面节奏对得上。 */
export function drawWaveform(s: Stereo, sr: number, tl?: Timeline, width = 1800, height = 420): Buffer {
  const c = createCanvas(width, height)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0d0f14'
  ctx.fillRect(0, 0, width, height)
  const N = s.l.length
  const mid = height / 2 + 10
  const amp = height * 0.42
  const per = N / width
  for (let x = 0; x < width; x++) {
    const a = Math.floor(x * per)
    const b = Math.floor((x + 1) * per)
    let peak = 0
    let sum = 0
    for (let n = a; n < b; n++) {
      const v = (Math.abs(s.l[n]!) + Math.abs(s.r[n]!)) / 2
      peak = Math.max(peak, v)
      sum += v * v
    }
    const rms = Math.sqrt(sum / Math.max(1, b - a))
    ctx.fillStyle = '#2b3a55'
    ctx.fillRect(x, mid - peak * amp, 1, peak * amp * 2)
    ctx.fillStyle = '#6fb6ff'
    ctx.fillRect(x, mid - rms * amp, 1, rms * amp * 2)
  }
  const dur = N / sr
  ctx.font = `500 15px ${DEFAULT_FONT}`
  ctx.textBaseline = 'top'
  for (const sec of tl?.sections ?? []) {
    const x = (sec.from / dur) * width
    ctx.fillStyle = '#ffffff55'
    ctx.fillRect(x, 0, 1, height)
    ctx.fillStyle = '#e8ecf3'
    ctx.fillText(sec.name, x + 4, 6)
  }
  const names = [...new Set((tl?.cues() ?? []).map((cue) => cue.name))]
  const palette = ['#ffb547', '#ff5d73', '#7ee787', '#c79bff', '#4fd1ff', '#f4f1ea']
  names.forEach((name, k) => {
    ctx.fillStyle = palette[k % palette.length]!
    for (const t of tl!.times(name)) ctx.fillRect((t / dur) * width, height - 14 - k * 6, 2, 5)
    ctx.fillText(name, 8 + k * 120, 28)
  })
  return c.toBuffer('image/png')
}
