export type Run<T, K> = { key: K; text: string; items: T[] }

/**
 * 把相邻、key 相同的项并成一段。key 是调用方自己的决定（颜色、状态、id……），框架只负责分组。
 * 字幕逐字算出各自的样子，再并成几个 span，排版只多几个节点：
 *
 * ```ts
 * runs(now.chars, (ch) => (ch.progress > 0 ? 'said' : 'next')).map((r) => h('span', { style: LOOK[r.key] }, r.text))
 * ```
 */
export function runs<T extends { text: string }, K>(items: readonly T[], key: (item: T, i: number) => K): Run<T, K>[] {
  const out: Run<T, K>[] = []
  items.forEach((item, i) => {
    const k = key(item, i)
    const last = out.at(-1)
    if (last && Object.is(last.key, k)) {
      last.text += item.text
      last.items.push(item)
    } else out.push({ key: k, text: item.text, items: [item] })
  })
  return out
}
