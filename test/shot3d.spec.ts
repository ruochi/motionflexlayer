import { checkFvg, h } from 'flexlayer'
import { describe, expect, it } from 'vitest'
import { defineComposition } from '../src/composition.js'
import { shot } from '../src/nodes.js'
import { renderRgba } from '../src/render/frame.js'
import { shot3d, type Pose3D } from '../src/shot3d.js'

const W = 1280
const H = 720
const RAD = Math.PI / 180

/** 物体盒子四角的世界坐标：绕中心先 rotateX、再 rotateY、再 rotate。 */
function worldCorners(p: Pose3D, w: number, hh: number): Array<[number, number, number]> {
  const s = p.scale ?? 1
  const [ax, ay, az] = [(p.rotateX ?? 0) * RAD, (p.rotateY ?? 0) * RAD, (p.rotate ?? 0) * RAD]
  return [
    [-w / 2, -hh / 2],
    [w / 2, -hh / 2],
    [w / 2, hh / 2],
    [-w / 2, hh / 2],
  ].map(([u, v]) => {
    let x = u! * s
    let y = v! * s
    let z = 0
    ;[y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)]
    ;[x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)]
    ;[x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)]
    return [p.x + x, p.y + y, (p.z ?? 0) + z]
  })
}

async function reportedQuad(cam: ReturnType<typeof shot3d>, p: Pose3D, w: number, hh: number, sized = true) {
  const size = sized ? { width: w, height: hh } : {}
  const card = cam.place({ ...p, ...size, id: 'card' }, h('rect', { x: 0, y: 0, width: w, height: hh, fill: '#ff0000' }))
  const report = await checkFvg(h('layer', { width: W, height: H }, h('layer', cam.layer, card)))
  const el = report.elements.find((e) => e.id === 'card')
  expect(el?.quad).toBeDefined()
  return { quad: el!.quad!.map((q) => [q.x, q.y]), issues: report.issues.map((i) => i.code) }
}

function expectQuad(cam: ReturnType<typeof shot3d>, quad: number[][], corners: Array<[number, number, number]>) {
  corners.forEach(([x, y, z], i) => {
    const s = cam.toScreen(x, y, z)!
    expect(Math.abs(quad[i]![0]! - s[0])).toBeLessThan(0.6)
    expect(Math.abs(quad[i]![1]! - s[1])).toBeLessThan(0.6)
  })
}

describe('shot3d', () => {
  it('默认机位：世界坐标原样落到画面，属性里只有位置', () => {
    const cam = shot3d({ width: W, height: H })
    expect(cam.toScreen(100, 200)).toEqual([100, 200])
    expect(cam.pose({ x: 100, y: 200 })).toEqual({ x: 100, y: 200, anchor: 'center' })
    const [ex, ey, ez] = cam.eye
    expect([ex, ey]).toEqual([W / 2, H / 2])
    expect(ez).toBeCloseTo(cam.perspective, 6)
  })

  it('yaw、pitch 为 0 时，z = 0 的平面和同参数的 shot() 一样', () => {
    const opts = { width: W, height: H, x: 300, y: 500, zoom: 2.5, rotate: 12 }
    const flat = shot({ ...opts, stage: [W, H], cover: false })
    const cam = shot3d(opts)
    for (const [x, y] of [[300, 500], [0, 0], [900, 120], [W, H]] as const) {
      const a = flat.toScreen(x, y)
      const b = cam.toScreen(x, y)!
      expect(b[0]).toBeCloseTo(a[0], 6)
      expect(b[1]).toBeCloseTo(a[1], 6)
    }
  })

  it('from 和 yaw / pitch / zoom 两种写法给出同一台相机', () => {
    const orbit = shot3d({ width: W, height: H, x: 500, y: 300, z: -100, yaw: 35, pitch: 20, zoom: 0.8 })
    const fromEye = shot3d({ width: W, height: H, x: 500, y: 300, z: -100, from: orbit.eye })
    expect(fromEye.yaw).toBeCloseTo(35, 6)
    expect(fromEye.pitch).toBeCloseTo(20, 6)
    expect(fromEye.zoom).toBeCloseTo(0.8, 6)
    expect(shot3d({ width: W, height: H, distance: orbit.distance, zoom: 3 }).zoom).toBeCloseTo(0.8, 6)
    const a = orbit.toScreen(800, 100, 250)!
    const b = fromEye.toScreen(800, 100, 250)!
    expect(b[0]).toBeCloseTo(a[0], 6)
    expect(b[1]).toBeCloseTo(a[1], 6)
  })

  it('机位往右绕时，右边的东西变近；抬高时，上面的东西变近', () => {
    const right = shot3d({ width: W, height: H, yaw: 30 })
    expect(right.project(W / 2 + 200, H / 2)!.depth).toBeLessThan(right.project(W / 2 - 200, H / 2)!.depth)
    const up = shot3d({ width: W, height: H, pitch: 30 })
    expect(up.project(W / 2, H / 2 - 200)!.depth).toBeLessThan(up.project(W / 2, H / 2 + 200)!.depth)
  })

  it.each([
    { cam: { yaw: 0, pitch: 0 }, obj: { x: 640, y: 360, z: -300, rotateY: 40 } },
    { cam: { yaw: 35, pitch: 18 }, obj: { x: 400, y: 300, z: 0 } },
    { cam: { yaw: -50, pitch: -10, rotate: 8, zoom: 1.6 }, obj: { x: 820, y: 420, z: -150, rotateX: 25, rotateY: -30, rotate: 15, scale: 0.7 } },
    { cam: { yaw: 120, pitch: 40, zoom: 0.6 }, obj: { x: 600, y: 500, z: 200, rotateX: 70, rotateY: 10 } },
    { cam: { yaw: 0, pitch: 89.5, zoom: 0.7 }, obj: { x: 640, y: 360, z: -100, rotateX: -90 } },
  ])('flexlayer 投影出来的四角和 toScreen 一致 %#', async ({ cam: c, obj }) => {
    const cam = shot3d({ width: W, height: H, ...c })
    for (const sized of [true, false]) {
      const { quad, issues } = await reportedQuad(cam, obj, 240, 140, sized)
      expectQuad(cam, quad, worldCorners(obj, 240, 140))
      expect(issues).toEqual([])
    }
  })

  it('低机位看地板：深度分给支点，z 不会大到被当成在观众身后', async () => {
    const cam = shot3d({ width: W, height: H, y: 400, pitch: 4, zoom: 1.2 })
    const floor = { x: 640, y: 560, z: 0, rotateX: 90 }
    const attrs = cam.pose({ ...floor, width: 1600, height: 1400 })!
    expect(Math.abs(Number(attrs.z ?? 0))).toBeLessThan(cam.perspective)
    const { quad, issues } = await reportedQuad(cam, floor, 1600, 1400)
    expectQuad(cam, quad, worldCorners(floor, 1600, 1400))
    expect(issues).not.toContain('behind-camera')
  })

  it('billboard 始终正对镜头，四角是一个和画面对齐的矩形', async () => {
    const cam = shot3d({ width: W, height: H, yaw: 50, pitch: 25 })
    const { quad } = await reportedQuad(cam, { x: 500, y: 300, z: -200, billboard: true }, 200, 100)
    expect(quad[0]![1]).toBeCloseTo(quad[1]![1]!, 1)
    expect(quad[0]![0]).toBeCloseTo(quad[3]![0]!, 1)
    const c = cam.toScreen(500, 300, -200)!
    expect((quad[0]![0]! + quad[2]![0]!) / 2).toBeCloseTo(c[0], 1)
    expect((quad[0]![1]! + quad[2]![1]!) / 2).toBeCloseTo(c[1], 1)
  })

  it('lens 按全画幅等效换算视角：24mm 的视距正好是取景窗高度', () => {
    expect(shot3d({ width: W, height: H, lens: 24 }).perspective).toBeCloseTo(H, 1)
    expect(shot3d({ width: W, height: H, lens: 50 }).perspective).toBeCloseTo((H * 50) / 24, 1)
    expect(shot3d({ width: W, height: H, lens: 50, perspective: 900 }).perspective).toBe(900)
  })

  it('景深默认对在对准点；也能对到一个世界坐标；sharp 的物体不糊', () => {
    const cam = shot3d({ width: W, height: H, yaw: 30, aperture: 10 })
    expect(cam.focus).toBeCloseTo(cam.distance, 6)
    expect(cam.pose({ x: W / 2, y: H / 2, width: 100, height: 100 })!.blur).toBeUndefined()
    expect(Number(cam.pose({ x: W / 2, y: H / 2, z: -2000, width: 100, height: 100 })!.blur)).toBeGreaterThan(0)
    expect(cam.pose({ x: W / 2, y: H / 2, z: -2000, width: 100, height: 100, sharp: true })!.blur).toBeUndefined()
    const far = shot3d({ width: W, height: H, yaw: 30, aperture: 10, focus: [W / 2, H / 2, -2000] })
    expect(far.pose({ x: W / 2, y: H / 2, z: -2000, width: 100, height: 100 })!.blur).toBeUndefined()
    expect(far.blurAt(far.distance)).toBeGreaterThan(0)
  })

  it.each([false, true])('景深：屏幕上的模糊半径和 blurAt 一致（场景里有网格：%s）', async (withMesh) => {
    const SW = 800
    const SH = 400
    const cam = shot3d({ width: SW, height: SH, aperture: 8, focus: 300 })
    for (const [z, scale] of [[0, 1], [-600, 1], [-1500, 1], [200, 0.5]] as const) {
      const card = cam.place({ x: 400, y: 200, z, scale, width: 200, height: 100 }, h('rect', { x: 0, y: 0, width: 200, height: 100, fill: '#ffffff' }))
      const ball = withMesh ? cam.place({ x: 60, y: 60, z: -50, width: 40, height: 40, sharp: true }, h('sphere', { cx: 20, cy: 20, r: 20, fill: '#888888' })) : null
      const comp = defineComposition({ width: SW, height: SH, duration: 1, background: '#000000', render: () => h('layer', { width: SW, height: SH }, cam.scene(ball, card)) })
      const { rgba } = await renderRgba(comp, 0)
      const row = Array.from({ length: 400 }, (_, x) => rgba[(200 * SW + x) * 4]!)
      const sigma = (row.findIndex((v) => v > 230) - row.findIndex((v) => v > 25)) / 2.56
      const want = cam.blurAt(cam.project(400, 200, z)!.depth)
      expect(Math.abs(sigma - want)).toBeLessThan(Math.max(0.6, want * 0.15))
    }
  })

  it('观众身后的物体不进文档', () => {
    const cam = shot3d({ width: W, height: H, zoom: 4 })
    expect(cam.place({ x: 640, y: 360, z: cam.distance + 10 })).toBeNull()
    expect(cam.toScreen(640, 360, cam.distance + 10)).toBeNull()
    expect(cam.place({ x: 640, y: 360, opacity: 0 })).toBeNull()
  })
})
