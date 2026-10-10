import type { Glyph } from 'flexlayer'

/** 轴对齐的矩形，四条边的坐标。 */
export type Bounds = { left: number; top: number; right: number; bottom: number }

/** 一组点的外接框。 */
export function boundsOf(points: Iterable<readonly [number, number]>): Bounds {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [x, y] of points) {
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }
  return { left, top, right, bottom }
}

/** 几个框合起来的外接框。 */
export function unionBounds(...list: Bounds[]): Bounds {
  return {
    left: Math.min(...list.map((b) => b.left)),
    top: Math.min(...list.map((b) => b.top)),
    right: Math.max(...list.map((b) => b.right)),
    bottom: Math.max(...list.map((b) => b.bottom)),
  }
}

/** 四个角各自变换后的外接框。`fn` 可以是 `cam.toScreen`，也可以是任何点到点的映射。 */
export function mapBounds(b: Bounds, fn: (x: number, y: number) => readonly [number, number]): Bounds {
  return boundsOf([fn(b.left, b.top), fn(b.right, b.top), fn(b.right, b.bottom), fn(b.left, b.bottom)])
}

export type Pose = { x: number; y: number; rotate?: number; scale?: number }

/** 相对中心的局部框，绕中心缩放、旋转（度）后放到 (x, y)，在画布上的外接框。 */
export function poseBounds(local: Bounds, p: Pose): Bounds {
  const s = p.scale ?? 1
  const r = ((p.rotate ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return mapBounds(local, (u, v) => [p.x + s * (cos * u - sin * v), p.y + s * (sin * u + cos * v)])
}

/** 框离画布四边最近的距离。伸出画布时是负数；描边、阴影外扩超过它就会被切掉。 */
export const edgeRoom = (b: Bounds, width: number, height: number) => Math.min(b.left, b.top, width - b.right, height - b.bottom)

/** 字身盒子中心摆在 p 的字形，着墨在画布上的外接框。没有着墨数据时按字身算。 */
export function glyphBounds(g: Glyph, p: Pose): Bounds {
  const ink = g.ink ?? { x: 0, y: 0, width: g.width, height: g.height }
  const left = ink.x - g.width / 2
  const top = ink.y - g.height / 2
  return poseBounds({ left, top, right: left + ink.width, bottom: top + ink.height }, p)
}

/**
 * 把这一帧成立的预期拼成 `expect` 属性的值，一条都不成立时是 undefined。
 * expect 要和问题一起开关，否则报 `unused-expect`：
 *
 * ```ts
 * place({ x, y, attrs: { expect: expects(off && 'overflow-canvas: 从画外飞进来', overlap && 'text-overlap: 交叉淡化') } }, …)
 * ```
 */
export function expects(...rules: Array<string | false | null | undefined>): string | undefined {
  const on = rules.filter((r): r is string => typeof r === 'string' && r.length > 0)
  return on.length ? on.join('; ') : undefined
}

/** SVG 路径的总长，给 `stroke-dasharray` 写字、画线用。曲线按折线近似，误差在 1% 以内。支持 M L Q C Z（大小写）。 */
export function pathLength(d: string): number {
  const tok = d.match(/[MLQCZmlqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  let i = 0
  let cmd = ''
  let rel = false
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let len = 0
  const n = () => Number(tok[i++])
  const seg = (nx: number, ny: number) => {
    len += Math.hypot(nx - x, ny - y)
    x = nx
    y = ny
  }
  while (i < tok.length) {
    if (/[a-z]/i.test(tok[i]!)) {
      rel = tok[i]! === tok[i]!.toLowerCase()
      cmd = tok[i++]!.toUpperCase()
    }
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    if (cmd === 'M') {
      x = sx = ox + n()
      y = sy = oy + n()
      cmd = 'L'
    } else if (cmd === 'L') seg(ox + n(), oy + n())
    else if (cmd === 'Q' || cmd === 'C') {
      const pts = (cmd === 'Q' ? [n(), n(), n(), n()] : [n(), n(), n(), n(), n(), n()]).map((v, j) => v + (j % 2 ? oy : ox))
      const [x0, y0] = [x, y]
      for (let k = 1; k <= 8; k++) {
        const u = k / 8
        const v = 1 - u
        if (cmd === 'Q') seg(v * v * x0 + 2 * v * u * pts[0]! + u * u * pts[2]!, v * v * y0 + 2 * v * u * pts[1]! + u * u * pts[3]!)
        else
          seg(
            v * v * v * x0 + 3 * v * v * u * pts[0]! + 3 * v * u * u * pts[2]! + u * u * u * pts[4]!,
            v * v * v * y0 + 3 * v * v * u * pts[1]! + 3 * v * u * u * pts[3]! + u * u * u * pts[5]!,
          )
      }
    } else if (cmd === 'Z') {
      seg(sx, sy)
      if (i < tok.length && !/[a-z]/i.test(tok[i]!)) i++
    } else i++
  }
  return len
}
