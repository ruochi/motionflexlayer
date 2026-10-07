import type { FvgReport, Issue } from 'flexlayer'
import { describe, expect, it } from 'vitest'
import { IssueLog } from '../src/render/issues.js'

const report = (issues: Issue[]) => ({ issues }) as unknown as FvgReport
const unused = (path: string, code: string): Issue => ({
  level: 'warn',
  code: 'unused-expect',
  path,
  message: `没有出现 ${code}`,
  expect: { code },
})

describe('IssueLog', () => {
  it('expect 有一帧对上，其余帧的 unused-expect 不报', () => {
    const log = new IssueLog()
    log.add(report([unused('layer/layer[1]', 'text-overlap')]), 0)
    log.add(report([{ level: 'info', code: 'text-overlap', path: 'layer/layer[1]/p[0]', message: '重叠', expected: '演示' }]), 1)
    expect(log.stats.map((s) => s.code)).toEqual(['text-overlap'])
  })

  it('一直没对上的照报；跨进程合并后仍按同一规则', () => {
    const a = new IssueLog()
    a.add(report([unused('layer/layer[2]', 'overflow-canvas')]), 0)
    const b = new IssueLog()
    b.add(report([unused('layer/layer[1]', 'text-overlap')]), 2)
    b.add(report([{ level: 'info', code: 'text-overlap', path: 'layer/layer[1]/p[0]', message: '重叠' }]), 3)
    const main = new IssueLog()
    main.merge(a.stats, a.frames)
    main.merge(b.stats, b.frames)
    expect(main.stats.map((s) => `${s.code} ${s.path}`)).toEqual(['unused-expect layer/layer[2]', 'text-overlap layer/layer[1]/p[0]'])
  })
})
