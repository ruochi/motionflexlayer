import { h, type FvgNode } from 'flexlayer'
import { clamp, r2, type Vec3 } from './math.js'
import type { Child } from './nodes.js'

const MESH_TAGS = new Set(['sphere', 'box', 'cylinder', 'torus', 'tube', 'extrude', 'model'])

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

function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
}

const apply = (m: Mat3, x: number, y: number, z: number): Vec3 => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
]

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

/**
 * 写在取景层上的 `camera`。字段和 flexlayer 的段名相同，`h()` 原样传过去。
 * 没写的字段用 flexlayer 的缺省：对准盒子中心、机位正对、距离等于焦距。
 */
export type CameraSpec = {
  focal?: number
  fov?: number
  lens?: number
  at?: [number, number, number]
  orbit?: [number, number]
  roll?: number
  distance?: number
  from?: [number, number, number]
  aperture?: number
  focus?: number | [number, number, number]
  max?: number
}

export type Shot3DOptions = {
  /** 三维取景窗，成片像素。写 `camera` 的那一层就是这么大，灭点在它中心。 */
  width: number
  height: number
  /** 对准的世界坐标，落在取景窗中心。默认 (width/2, height/2, 0)。 */
  x?: number
  y?: number
  z?: number
  /**
   * 推近倍数，和 `shot()` 同义：对准点所在、正对镜头的那张平面上，1 世界像素是 zoom 成片像素。
   * 靠机位前后移动做到（dolly），所以前后景的透视会跟着变。写了 `distance` 就不看这个。
   */
  zoom?: number
  /** 机位到对准点的距离，像素。直接给推轨的距离，写了就不看 zoom（zoom = 视距 / distance）。 */
  distance?: number
  /** 机位绕对准点水平转，度。正数机位往右绕，画面里的东西往左转。 */
  yaw?: number
  /** 机位绕对准点抬高，度。正数从上往下看。 */
  pitch?: number
  /** 镜头绕视线转，度，和 `shot()` 的 rotate 同义。正数时画面里的内容顺时针转。 */
  rotate?: number
  /** 机位的世界坐标。写了就由它和对准点算出 yaw、pitch、距离，三者不再看。 */
  from?: Vec3
  /** 竖直视角，度。默认 40。 */
  fov?: number
  /** 焦距，毫米，按全画幅（底高 24mm）等效：24 广角、50 标准、85 人像、200 长焦。优先于 fov。 */
  lens?: number
  /** 直接给视距（像素），优先于 lens 和 fov。 */
  perspective?: number
  /**
   * 景深：无限远处的模糊半径，成片像素。不写就没有景深。
   * 半径 = aperture × |深度 − 对焦距离| / 深度，由 flexlayer 按每个像素算，近处的糊边盖到远处。
   */
  aperture?: number
  /** 对焦距离，像素，从机位沿视线量；或者一个世界坐标，对到那一点所在的深度。默认对准点。 */
  focus?: number | Vec3
  /** 模糊半径的上限，成片像素。默认 aperture × 3。 */
  maxBlur?: number
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
  /** 不吃景深。地板这类跨很多深度的大表面整张跟着糊会很假，可以关掉。 */
  sharp?: boolean
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
  /** 写在三维取景窗那层：宽高和 `camera`。物体写世界姿态，可以是直接子元素，也可以放在 `preserve-3d` 里。 */
  layer: { width: number; height: number; camera: CameraSpec }
  /** 算出来的视距，像素。 */
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
  /** 对焦距离，像素。 */
  focus: number
  /** 这一深度上的景深模糊半径，成片像素。没写 aperture 时恒为 0。draw 里的粒子按它糊。 */
  blurAt(depth: number): number
  /**
   * 世界姿态 → 层属性。在观众身后返回 null。
   * `x`、`y`、`z` 是盒子中心。有旋转时不要直接铺开：flexlayer 的 `z` 在旋转之前，中心会跟着转走。
   * 用 `place()`，它在外面加一层 `preserve-3d` 放位置，旋转写在里面。
   */
  pose(p: Pose3D): Record<string, string | number | undefined> | null
  /** 把内容按世界姿态摆进镜头。几乎透明或在观众身后时返回 null。 */
  place(p: Pose3D, ...children: Child[]): FvgNode | null
  /** 三维取景窗那层：`h('layer', cam.layer, ...objects)`。 */
  scene(...objects: Child[]): FvgNode
}

/** 景深开关写在被光栅化的那一层上。包着网格时，网格自己也要带上。 */
function markSharp(child: Child): Child {
  if (child == null || child === false || typeof child === 'string' || !MESH_TAGS.has(child.tag)) return child
  if (child.attrs.sharp != null) return child
  return { ...child, attrs: { ...child.attrs, sharp: 'true' } }
}

/**
 * 三维镜头：`shot()` 的透视版。对准点、推近、转都和 `shot()` 同义，多了机位绕对准点的 yaw、pitch 和视角。
 * yaw、pitch 都是 0 且物体在 z = 0 时，画面和同参数的 `shot()` 一样。
 *
 * 机位写在取景窗那层的 `camera` 上，物体保持世界姿态：
 *
 * ```ts
 * const cam = shot3d({ width: W, height: H, x, y, zoom, yaw, pitch })
 * cam.scene(cam.place({ x: 400, y: 300, z: -200, rotateY: 30 }, card), ...)
 * ```
 *
 * 要分组，在中间一层写 `preserve-3d`，子元素仍进这一台镜头。自己再写 `camera` 或 `perspective` 的内层是另一台镜头。
 * 震屏、调色、暗角写在外面一层 `shot()` 的取景窗上；字幕、标注写在取景窗外，用 `toScreen` 跟住三维里的点。
 */
export function shot3d(opts: Shot3DOptions): Shot3D {
  const { width: W, height: H } = opts
  const fov = opts.lens != null ? (2 * Math.atan(12 / opts.lens)) / RAD : (opts.fov ?? 40)
  const P = opts.perspective ?? H / 2 / Math.tan((fov * RAD) / 2)
  const target: Vec3 = [opts.x ?? W / 2, opts.y ?? H / 2, opts.z ?? 0]
  let yaw = opts.yaw ?? 0
  let pitch = opts.pitch ?? 0
  let zoom = opts.distance != null ? P / opts.distance : (opts.zoom ?? 1)
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
  const roll = opts.rotate ?? 0
  const view = mul(rotZ(roll), mul(rotX(-pitch), rotY(-yaw)))
  const cx = W / 2
  const cy = H / 2
  const cz = P - distance
  const back = apply([view[0], view[3], view[6], view[1], view[4], view[7], view[2], view[5], view[8]], 0, 0, distance)
  const eye: Vec3 = [target[0] + back[0], target[1] + back[1], target[2] + back[2]]

  const camera: CameraSpec = {}
  if (opts.perspective != null) camera.focal = opts.perspective
  else if (opts.lens != null) camera.lens = opts.lens
  else camera.fov = opts.fov ?? 40
  if (opts.x != null || opts.y != null || opts.z != null) camera.at = [target[0], target[1], target[2]]
  if (opts.from) camera.from = [opts.from[0], opts.from[1], opts.from[2]]
  else {
    if ((opts.yaw ?? 0) !== 0 || (opts.pitch ?? 0) !== 0) camera.orbit = [opts.yaw ?? 0, opts.pitch ?? 0]
    if (opts.distance != null || (opts.zoom != null && opts.zoom !== 1)) camera.distance = distance
  }
  if (roll !== 0) camera.roll = roll

  const aperture = opts.aperture ?? 0
  const maxBlur = opts.maxBlur ?? aperture * 3
  const focusAt = (f: number | Vec3): number => {
    if (typeof f === 'number') return f
    const [, , vz] = apply(view, f[0] - target[0], f[1] - target[1], f[2] - target[2])
    return distance - vz
  }
  const focus = opts.focus != null ? focusAt(opts.focus) : distance
  if (aperture > 0) {
    camera.aperture = aperture
    if (typeof opts.focus === 'number') camera.focus = opts.focus
    else if (opts.focus) camera.focus = [opts.focus[0], opts.focus[1], opts.focus[2]]
    if (opts.maxBlur != null) camera.max = opts.maxBlur
  }
  const blurAt = (depth: number): number =>
    aperture > 0 && depth > 0 ? Math.min(maxBlur, (aperture * Math.abs(depth - focus)) / depth) : 0

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
    if (!project(p.x, p.y, p.z ?? 0)) return null
    let rx = p.rotateX ?? 0
    let ry = p.rotateY ?? 0
    let rz = p.rotate ?? 0
    if (p.billboard) {
      // 世界旋转先发生，镜头矩阵后乘。要在镜头里只剩绕视线的转，世界旋转取镜头旋转的逆。
      const facing = eulerOf(mul(transpose(view), rotZ(rz)))
      rx = facing[0]
      ry = facing[1]
      rz = facing[2]
    }
    const scale = p.scale ?? 1
    const attrs: Record<string, string | number | undefined> = { x: r2(p.x), y: r2(p.y), anchor: 'center' }
    if (p.id != null) attrs.id = p.id
    if (p.width != null) attrs.width = p.width
    if (p.height != null) attrs.height = p.height
    if (p.z) attrs.z = r2(p.z)
    const ax = r3(rx)
    const ay = r3(ry)
    const az = r3(rz)
    if (ax) attrs.rotateX = ax
    if (ay) attrs.rotateY = ay
    if (az) attrs.rotate = az
    if (scale !== 1) attrs.scale = Math.round(scale * 10000) / 10000
    if (p.sharp) attrs.sharp = 'true'
    return { ...attrs, ...p.attrs }
  }

  const layer = { width: W, height: H, camera }

  return {
    layer,
    perspective: P,
    distance,
    zoom,
    yaw,
    pitch,
    eye,
    toView,
    focus,
    blurAt,
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
      const kids = p.sharp ? children.map(markSharp) : children
      const spins = attrs.rotateX != null || attrs.rotateY != null || attrs.rotate != null || (attrs.scale != null && Number(attrs.scale) !== 1)
      if (!spins) {
        if (opacity < 1) attrs.opacity = r2(clamp(opacity) * 1000) / 1000
        return h('layer', attrs, ...kids)
      }
      // z 写在旋转之前，中心会偏离。位置放在外层，旋转放在内层，中心才停在给出的世界坐标上。
      if (opacity < 1) attrs.opacity = r2(clamp(opacity) * 1000) / 1000
      const inner: Record<string, string | number | undefined> = {
        id: attrs.id,
        width: attrs.width,
        height: attrs.height,
        rotateX: attrs.rotateX,
        rotateY: attrs.rotateY,
        rotate: attrs.rotate,
        scale: attrs.scale,
        sharp: attrs.sharp,
        opacity: attrs.opacity,
        ...p.attrs,
      }
      return h(
        'layer',
        { x: attrs.x, y: attrs.y, z: attrs.z, anchor: 'center', width: attrs.width, height: attrs.height, 'preserve-3d': 'true' },
        h('layer', inner, ...kids),
      )
    },
    scene(...objects) {
      return h('layer', layer, ...objects)
    },
  }
}
