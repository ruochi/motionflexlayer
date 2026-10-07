import type { FvgReport, Issue } from 'flexlayer'
import type { LintProfile } from '../composition.js'

export type IssueStat = {
  level: Issue['level']
  code: string
  path: string
  message: string
  hint?: string
  frames: number
  first: number
  last: number
}

/**
 * 跨帧汇总 flexlayer 的报告。同一个 (level, code, path) 合并成一条，记下出现了几帧、首末时间。
 * 海报只有一帧，视频是几千帧，逐帧打印没法看。
 */
export class IssueLog {
  private readonly map = new Map<string, IssueStat>()
  frames = 0

  constructor(private readonly lint: LintProfile = {}) {}

  add(report: FvgReport, t: number): void {
    this.frames++
    for (const issue of report.issues) {
      if (this.lint.ignore?.includes(issue.code)) continue
      const key = `${issue.level}\u0000${issue.code}\u0000${issue.path}`
      const s = this.map.get(key)
      if (s) {
        s.frames++
        s.first = Math.min(s.first, t)
        s.last = Math.max(s.last, t)
      } else {
        this.map.set(key, { ...issue, frames: 1, first: t, last: t })
      }
    }
  }

  merge(stats: IssueStat[], frames: number): void {
    this.frames += frames
    for (const s of stats) {
      const key = `${s.level}\u0000${s.code}\u0000${s.path}`
      const cur = this.map.get(key)
      if (cur) {
        cur.frames += s.frames
        cur.first = Math.min(cur.first, s.first)
        cur.last = Math.max(cur.last, s.last)
      } else this.map.set(key, { ...s })
    }
  }

  get stats(): IssueStat[] {
    const rank = { error: 0, warn: 1, info: 2 } as const
    return [...this.map.values()].sort((a, b) => rank[a.level] - rank[b.level] || b.frames - a.frames)
  }

  get errorCount(): number {
    return this.stats.filter((s) => s.level === 'error').length
  }

  format(max = 30): string {
    const list = this.stats
    if (list.length === 0) return `问题：无（${this.frames} 帧）`
    const lines = [`问题：${list.length} 类，共检查 ${this.frames} 帧`]
    for (const s of list.slice(0, max)) {
      const span = s.first === s.last ? `${s.first.toFixed(2)}s` : `${s.first.toFixed(2)}–${s.last.toFixed(2)}s`
      lines.push(`  ${s.level.padEnd(5)} ${s.code}  ${s.path}  ×${s.frames}  ${span}`)
      lines.push(`        ${s.message}${s.hint ? `  → ${s.hint}` : ''}`)
    }
    if (list.length > max) lines.push(`  ……还有 ${list.length - max} 类`)
    return lines.join('\n')
  }
}
