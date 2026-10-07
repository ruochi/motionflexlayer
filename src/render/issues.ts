import type { FvgReport, Issue } from 'flexlayer'
import type { LintProfile } from '../composition.js'

export type IssueStat = {
  level: Issue['level']
  code: string
  path: string
  message: string
  hint?: string
  /** unused-expect 才有：没对上的问题码。 */
  expect?: { code: string }
  frames: number
  first: number
  last: number
}

const keyOf = (s: { level: string; code: string; path: string; expect?: { code: string } }) =>
  `${s.level}\u0000${s.code}\u0000${s.path}\u0000${s.expect?.code ?? ''}`

/**
 * 跨帧汇总 flexlayer 的报告。同一个 (level, code, path) 合并成一条，记下出现了几帧、首末时间。
 * 海报只有一帧，视频是几千帧，逐帧打印没法看。
 *
 * 和 flexlayer 的多帧检查一致：一句 expect 只要有一帧对上了，别的帧里的 unused-expect 不再报。
 * 只在某几秒里故意越界、叠字的元素，可以一直挂着 expect。
 */
export class IssueLog {
  private readonly map = new Map<string, IssueStat>()
  frames = 0

  constructor(private readonly lint: LintProfile = {}) {}

  add(report: FvgReport, t: number): void {
    this.frames++
    for (const issue of report.issues) {
      if (this.lint.ignore?.includes(issue.code)) continue
      const key = keyOf(issue)
      const s = this.map.get(key)
      if (s) {
        s.frames++
        s.first = Math.min(s.first, t)
        s.last = Math.max(s.last, t)
      } else {
        this.map.set(key, {
          level: issue.level,
          code: issue.code,
          path: issue.path,
          message: issue.message,
          hint: issue.hint,
          expect: issue.expect,
          frames: 1,
          first: t,
          last: t,
        })
      }
    }
  }

  merge(stats: IssueStat[], frames: number): void {
    this.frames += frames
    for (const s of stats) {
      const key = keyOf(s)
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
    const all = [...this.map.values()]
    const used = (s: IssueStat) =>
      all.some((o) => o.code === s.expect?.code && (o.path === s.path || o.path.startsWith(`${s.path}/`)))
    return all
      .filter((s) => s.code !== 'unused-expect' || !used(s))
      .sort((a, b) => rank[a.level] - rank[b.level] || b.frames - a.frames)
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
