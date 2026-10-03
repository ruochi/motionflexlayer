/**
 * 可复现的随机。渲染是多进程、乱序取帧的，Math.random 每次结果都不同，禁止在帧函数里用。
 * 需要随机就用种子：同一个种子同一串数。
 */
export function rng(seed = 1): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 整数 → [0, 1) 的哈希。第 i 个元素的固定随机属性：hash(i, 3) 永远是同一个数。 */
export function hash(i: number, seed = 0): number {
  let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const fade5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** 一维平滑值噪声，-1..1。 */
export function noise1(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash(i) * 2 - 1
  const b = hash(i + 1) * 2 - 1
  return a + (b - a) * fade5(f)
}

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
] as const

const PERM = (() => {
  const r = rng(1337)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j]!, p[i]!]
  }
  return Uint8Array.from([...p, ...p])
})()

/** 三维 simplex 噪声，约 -1..1。第三维常拿来当时间，得到连续流动的二维场。 */
export function simplex3(x: number, y: number, z: number): number {
  const F3 = 1 / 3
  const G3 = 1 / 6
  const s = (x + y + z) * F3
  const i = Math.floor(x + s)
  const j = Math.floor(y + s)
  const k = Math.floor(z + s)
  const t = (i + j + k) * G3
  const x0 = x - (i - t)
  const y0 = y - (j - t)
  const z0 = z - (k - t)
  let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number
  if (x0 >= y0) {
    if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]
    else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]
    else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]
  } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]
  else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]
  else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]
  const corners = [
    [x0, y0, z0, 0, 0, 0],
    [x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, i1, j1, k1],
    [x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, i2, j2, k2],
    [x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, 1, 1, 1],
  ] as const
  const ii = i & 255
  const jj = j & 255
  const kk = k & 255
  let n = 0
  for (const [cx, cy, cz, di, dj, dk] of corners) {
    let tt = 0.6 - cx * cx - cy * cy - cz * cz
    if (tt < 0) continue
    const g = GRAD3[PERM[ii + di + PERM[jj + dj + PERM[kk + dk]!]!]! % 12]!
    tt *= tt
    n += tt * tt * (g[0] * cx + g[1] * cy + g[2] * cz)
  }
  return 32 * n
}

/** 二维 simplex。 */
export const simplex2 = (x: number, y: number) => simplex3(x, y, 0.5)

/**
 * 旋度噪声速度场：无散度，粒子顺着它走不会挤成团。返回 [vx, vy]，约 -1..1。
 * z 当时间推进，场会缓慢变形。
 */
export function curl2(x: number, y: number, z: number, eps = 0.01): [number, number] {
  const dy = (simplex3(x, y + eps, z) - simplex3(x, y - eps, z)) / (2 * eps)
  const dx = (simplex3(x + eps, y, z) - simplex3(x - eps, y, z)) / (2 * eps)
  return [dy * 0.25, -dx * 0.25]
}
