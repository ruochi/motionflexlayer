/**
 * 品牌片的计划闸门。
 *
 * 画面还没写之前，分镜、文案出处、素材清单必须先放在合成入口旁边。
 * 这里查的是这三份文件有没有写完，以及时间轴是不是按段排了事件。
 * 不数函数调用：纯函数里多写几个 spring 就能把次数垫上去，垫不出内容。
 */

import type { Timeline } from '../timeline.js'

export type PlanFiles = {
  shotList?: string
  copy?: string
  assets?: string
}

export type PlanIssue = { file: string; message: string }

const ACT = /^段\s*([1-5])\b/

function blocks(md: string): { title: string; body: string }[] {
  return md
    .split(/^##\s+/m)
    .slice(1)
    .map((part) => {
      const nl = part.indexOf('\n')
      return {
        title: (nl === -1 ? part : part.slice(0, nl)).trim(),
        body: nl === -1 ? '' : part.slice(nl + 1),
      }
    })
}

function has(md: string | undefined, word: string): boolean {
  return md != null && md.includes(word)
}

function eventRows(body: string): number {
  return body.split('\n').filter((line) => /^\|\s*\d/.test(line)).length
}

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

  const shot = files.shotList ?? ''
  for (const word of ['隐喻', '色板', '节拍', '分区', '自检']) {
    if (shot && !shot.includes(word)) fail('shot-list.md', `缺「${word}」一节`)
  }

  const acts = blocks(shot).filter((b) => ACT.test(b.title))
  if (shot && acts.length < 5) fail('shot-list.md', `五段结构只找到 ${acts.length} 段（标题要写成「## 段 1 …」）`)
  for (const act of acts) {
    const n = ACT.exec(act.title)?.[1]
    if (!act.body.includes('镜头')) fail('shot-list.md', `段 ${n} 没有写镜头`)
    if (n === '5') {
      if (!act.body.includes('落幅')) fail('shot-list.md', '段 5 没有写落幅')
    } else if (!act.body.includes('转场')) fail('shot-list.md', `段 ${n} 没有写转场`)
    const rows = eventRows(act.body)
    if (rows < 5) fail('shot-list.md', `段 ${n} 的时刻表只有 ${rows} 行，至少 5 行`)
  }

  const zones = blocks(shot).find((b) => b.title.startsWith('分区'))
  if (zones) {
    const rows = zones.body.split('\n').filter((line) => /^\|\s*[1-5]\s*\|/.test(line)).length
    if (rows < 5) fail('shot-list.md', `分区表只有 ${rows} 行，五段各一行`)
  }

  const check = blocks(shot).find((b) => b.title.startsWith('自检'))
  if (check) {
    const done = check.body.split('\n').filter((line) => /^-\s+\[x\]/i.test(line)).length
    if (done < 8) fail('shot-list.md', `自检勾了 ${done} 条，至少 8 条`)
  }

  const copy = files.copy ?? ''
  if (copy && !copy.includes('出处')) fail('copy.md', '文案表要有「出处」列')
  if (copy) {
    const rows = copy.split('\n').filter((line) => /^\|/.test(line) && !/^\|\s*-+/.test(line) && !line.includes('出处')).length
    if (rows < 4) fail('copy.md', `有出处的文案只有 ${rows} 行，至少 4 行`)
  }

  const assets = files.assets ?? ''
  if (assets && !has(assets, '标记')) fail('assets.md', '要写清标记（logo）是哪一个文件')
  if (assets && !has(assets, '来源')) fail('assets.md', '每个素材要有来源')
  if (assets && !/\.(svg|png|webp|jpe?g)/i.test(assets)) fail('assets.md', '标记要落到一个图片文件上')

  return issues
}

export type StructureInput = { duration: number; tl: Timeline }

/**
 * 时间轴和分镜是不是同一件东西：时长够一条片子，五段（短片三段）都有事件。
 * 一段里的事件少于 5 个，这段在计划里就是空的。
 */
export function auditStructure(comp: StructureInput): PlanIssue[] {
  const issues: PlanIssue[] = []
  const fail = (message: string) => issues.push({ file: '时间轴', message })
  const { duration, tl } = comp
  if (!(duration >= 10 && duration <= 90)) fail(`时长 ${duration}s 不在 10–90 秒里`)
  const sections = tl.sections
  const need = duration >= 12 ? 5 : 3
  if (sections.length < need) fail(`只有 ${sections.length} 段，这种时长至少 ${need} 段`)
  if (sections[0] && sections[0].from > 0.05) fail('第一段不是从 0 开始')
  const cues = tl.cues()
  const perAct = duration >= 12 ? 5 : 3
  for (const s of sections) {
    const last = s.index === sections.length - 1
    const n = cues.filter((c) => c.t >= s.from - 1e-6 && (last ? c.t <= s.to + 1e-6 : c.t < s.to - 1e-6)).length
    if (n < perAct) fail(`段「${s.name}」（${s.from}–${s.to}s）里只有 ${n} 个 cue，至少 ${perAct} 个`)
  }
  return issues
}

export function formatPlan(issues: PlanIssue[]): string {
  if (issues.length === 0) return '计划闸门\n0 failed'
  const lines = ['计划闸门', ...issues.map((i) => `FAIL  ${i.file}  ${i.message}`), `${issues.length} failed`]
  return lines.join('\n')
}
