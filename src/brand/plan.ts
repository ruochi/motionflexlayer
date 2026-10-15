/**
 * 品牌片的计划闸门。
 *
 * 画面还没写之前，分镜、文案出处、素材清单先放在合成入口旁边。
 * 这里只查这三份文件在不在、有没有写完。段数、时刻表、自检写在文档里，文档会改，闸门不锁死。
 */

export type PlanFiles = {
  shotList?: string
  copy?: string
  assets?: string
}

export type PlanIssue = { file: string; message: string }

/** 分镜、文案、素材三份文件。缺一项、或还留着「待填」，都算没过。 */
export function auditPlan(files: PlanFiles): PlanIssue[] {
  const issues: PlanIssue[] = []
  const fail = (file: string, message: string) => issues.push({ file, message })

  if (!files.shotList?.trim()) fail('shot-list.md', '没有分镜表')
  if (!files.copy?.trim()) fail('copy.md', '没有文案出处')
  if (!files.assets?.trim()) fail('assets.md', '没有素材清单')

  for (const [file, text] of [
    ['shot-list.md', files.shotList],
    ['copy.md', files.copy],
    ['assets.md', files.assets],
  ] as const) {
    if (text?.includes('待填')) fail(file, '还有「待填」，计划没写完')
  }

  return issues
}

export function formatPlan(issues: PlanIssue[]): string {
  if (issues.length === 0) return '计划闸门\n0 failed'
  const lines = ['计划闸门', ...issues.map((i) => `FAIL  ${i.file}  ${i.message}`), `${issues.length} failed`]
  return lines.join('\n')
}
