import { h, type FvgNode } from 'flexlayer'
import { clamp, r2, type Vec3 } from './math.js'
import { originAttr, type Child } from './nodes.js'

type Mat3 = [number, number, number, number, number, number, number, number, number]

const RAD = Math.PI / 180

/** 和 flexlayer 同一套轴：x 向右，y 向下，z 朝观众。行主序。 */
function rotX(deg: number): Mat3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [1, 0, 0, 0, c, -s, 0, s, c]
}

function rotY(deg: number): Mat3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}

function rotZ(deg: number): Mat3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const o = new Array<number>(9) as Mat3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!
  }
  return o
}

const apply = (m: Mat3, x: number, y: number, z: number): Vec3 => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
]

/** flexlayer 一层上的旋转顺序：先 rotateX，再 rotateY，再 rotate。 */
const layerRotation = (rx: number, ry: number, rz: number) => mul(rotZ(rz), mul(rotY(ry), rotX(rx)))

/** 拆回 rotateX、rotateY、rotate（度）。rotateY 落在 ±90 附近时 rotate 记 0。 */
function eulerOf(m: Mat3): [number, number, number] {
  const sy = clamp(-m[6], -1, 1)
  const ry = Math.asin(sy)
  if (Math.cos(ry) > 1e-6) return [Math.atan2(m[7], m[8]) / RAD, ry / RAD, Math.atan2(m[3], m[0]) / RAD]
  return [Math.atan2(-m[5], m[4]) / RAD, ry / RAD, 0]
}

const r3 = (v: number) => {
  const n = Math.round(v * 1000) / 1000
  return Object.is(n, -0) ? 0 : n
}

export type Shot3DOptions = {
  /** 三维取景窗，成片像素。写 `perspective` 的那一层就是这么大，灭点在它中心。 */
  width: number
  height: number
  /** 对准的世界坐标，落在取景窗中心。默认 (width/2, height/2, 0)。 */
  x?: number
  y?: number
  z?: number
  /**
   * 推近倍数，和 `shot()` 同义：对准点所在、正对镜头的那张平面上，1 世界像素是 zoom 成片像素。
   * 靠机位前后移动做到（dolly），所以前后景的透视会跟着变。
   */
  zoom?: number
  /** 机位绕对准点水平转，度。正数机位往右绕，画面里的东西往左转。 */
  yaw?: number
  /** 机位绕对准点抬高，度。正数从上往下看。 */
  pitch?: number
  /** 舞台绕对准点转，度，和 `shot()` 的 rotate 同义。 */
  rotate?: number
  /** 机位的世界坐标。写了就由它和对准点算出 yaw、pitch、zoom，三者不再看。 */
  from?: Vec3
  /** 竖直视角，度。默认 40。 */
  fov?: number
  /** 直接给视距（像素），优先于 fov。 */
  perspective?: number
}

export type Pose3D = {
  /** 这一层盒子中心的世界坐标。 */
  x: number
  y: number
  z?: number
  /** 世界里的朝向，度，顺序和 flexlayer 一层上的一样：先 rotateX，再 rotateY，再 rotate。 */
  rotateX?: number
  rotateY?: number
  rotate?: number
  /** 只支持等比。 */
  scale?: number
  /** 始终正对镜头，只保留 rotate。标签、粒子贴片用。 */
  billboard?: boolean
  opacity?: number
  width?: number
  height?: number
  id?: string
  attrs?: Record<string, string | number | undefined>
}

export type Projected = {
  x: number
  y: number
  /** 这一点上 1 世界像素是几个成片像素。 */
  scale: number
  /** 离观众的前后距离，像素，越小越近。 */
  depth: number
}

export type Shot3D = {
  /** 写在三维取景窗那层：宽高和 `perspective`。物体都要是这一层的直接子元素。 */
  layer: { width: number; height: number; perspective: number }
  perspective: number
  /** 机位到对准点的距离。 */
  distance: number
  zoom: number
  yaw: number
  pitch: number
  /** 机位的世界坐标。 */
  eye: Vec3
  /** 世界坐标 → 三维取景窗那层的局部坐标（投影前）。 */
  toView(x: number, y: number, z?: number): Vec3
  /** 世界坐标 → 取景窗里的成片像素。在观众身后返回 null。 */
  toScreen(x: number, y: number, z?: number): [number, number] | null
  /** toScreen 带上这一点的缩放和深度。draw 里画点云、粒子用。 */
  project(x: number, y: number, z?: number): Projected | null
  /** 世界姿态 → 直接子层的属性。在观众身后返回 null。 */
  pose(p: Pose3D): Record<string, string | number | undefined> | null
  /** 把内容按世界姿态摆进镜头，返回 layer。几乎透明或在观众身后时返回 null。 */
  place(p: Pose3D, ...children: Child[]): FvgNode | null
}

/**
 * 三维镜头：`shot()` 的透视版。对准点、推近、转都和 `shot()` 同义，多了机位绕对准点的 yaw、pitch 和视角。
 * yaw、pitch 都是 0 且物体在 z = 0 时，画面和同参数的 `shot()` 一样。
 *
 * flexlayer 只给 `perspective` 层的直接子元素做三维投影，嵌套层会先压成一张平面，
 * 所以镜头不能像 `view` 那样包一层舞台，而是把镜头变换乘进每个物体的姿态：
 *
 * ```ts
 * const cam = shot3d({ width: W, height: H, x, y, zoom, yaw, pitch })
 * h('layer', cam.layer, cam.place({ x: 400, y: 300, z: -200, rotateY: 30 }, card), ...)
 * ```
 *
 * 震屏、调色、暗角写在外面一层 `shot()` 的取景窗上；字幕、标注写在取景窗外，用 `toScreen` 跟住三维里的点。
 */
export function shot3d(opts: Shot3DOptions): Shot3D {
  const { width: W, height: H } = opts
  const P = r2(opts.perspective ?? H / 2 / Math.tan(((opts.fov ?? 40) * RAD) / 2))
  const target: Vec3 = [opts.x ?? W / 2, opts.y ?? H / 2, opts.z ?? 0]
  let yaw = opts.yaw ?? 0
  let pitch = opts.pitch ?? 0
  let zoom = opts.zoom ?? 1
  if (opts.from) {
    const dx = opts.from[0] - target[0]
    const dy = opts.from[1] - target[1]
    const dz = opts.from[2] - target[2]
    const d = Math.hypot(dx, dy, dz)
    if (d < 1e-6) throw new Error('shot3d 的 from 和对准点重合')
    yaw = Math.atan2(dx, dz) / RAD
    pitch = Math.asin(clamp(-dy / d, -1, 1)) / RAD
    zoom = P / d
  }
  if (!(zoom > 0)) throw new Error('shot3d 的 zoom 必须大于 0')
  const distance = P / zoom
  const view = mul(rotZ(opts.rotate ?? 0), mul(rotX(-pitch), rotY(-yaw)))
  const cx = W / 2
  const cy = H / 2
  const cz = P - distance
  const back = apply([view[0], view[3], view[6], view[1], view[4], view[7], view[2], view[5], view[8]], 0, 0, distance)
  const eye: Vec3 = [target[0] + back[0], target[1] + back[1], target[2] + back[2]]

  const toView = (x: number, y: number, z = 0): Vec3 => {
    const [vx, vy, vz] = apply(view, x - target[0], y - target[1], z - target[2])
    return [cx + vx, cy + vy, cz + vz]
  }

  const project = (x: number, y: number, z = 0): Projected | null => {
    const q = toView(x, y, z)
    const w = 1 - q[2] / P
    if (w <= 1e-4) return null
    return { x: cx + (q[0] - cx) / w, y: cy + (q[1] - cy) / w, scale: 1 / w, depth: P - q[2] }
  }

  const pose = (p: Pose3D): Record<string, string | number | undefined> | null => {
    const q = toView(p.x, p.y, p.z ?? 0)
    if (q[2] >= P * (1 - 1e-3)) return null
    const r = p.billboard ? rotZ(p.rotate ?? 0) : mul(view, layerRotation(p.rotateX ?? 0, p.rotateY ?? 0, p.rotate ?? 0))
    const [rx, ry, rz] = eulerOf(r)
    const scale = p.scale ?? 1
    // flexlayer 的支点落在 z = 0，深度只能靠沿法线的 z，或者把支点挪离盒子中心。
    // 知道宽高时两者按最小范数分摊：贴地的平面不会因为 z 很大被当成在观众身后。
    let z: number
    let dx = 0
    let dy = 0
    if (p.width != null && p.height != null) {
      const v0 = r[8]
      const v1 = scale * r[6]
      const v2 = scale * r[7]
      const k = q[2] / (v0 * v0 + v1 * v1 + v2 * v2)
      z = k * v0
      dx = k * v1
      dy = k * v2
    } else {
      // 法线几乎躺平时平面是一条线，夹一下避免除以 0。
      const nz = Math.abs(r[8]) < 1e-4 ? (r[8] < 0 ? -1e-4 : 1e-4) : r[8]
      z = q[2] / nz
    }
    const off = apply(r, scale * dx, scale * dy, z)
    return {
      id: p.id,
      x: r2(q[0] - off[0] + dx),
      y: r2(q[1] - off[1] + dy),
      anchor: 'center',
      width: p.width,
      height: p.height,
      origin: dx || dy ? originAttr([p.width! / 2 - dx, p.height! / 2 - dy]) : undefined,
      z: r2(z) || undefined,
      rotateX: r3(rx) || undefined,
      rotateY: r3(ry) || undefined,
      rotate: r3(rz) || undefined,
      scale: scale !== 1 ? Math.round(scale * 10000) / 10000 : undefined,
      ...p.attrs,
    }
  }

  return {
    layer: { width: W, height: H, perspective: P },
    perspective: P,
    distance,
    zoom,
    yaw,
    pitch,
    eye,
    toView,
    toScreen(x, y, z = 0) {
      const s = project(x, y, z)
      return s ? [s.x, s.y] : null
    },
    project,
    pose,
    place(p, ...children) {
      const opacity = p.opacity ?? 1
      if (opacity <= 0.002) return null
      const attrs = pose(p)
      if (!attrs) return null
      if (opacity < 1) attrs.opacity = r2(clamp(opacity) * 1000) / 1000
      return h('layer', attrs, ...children)
    },
  }
}
