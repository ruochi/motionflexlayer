/**
 * 三维镜头：shot3d() 绕着一组卡片、一块地板和一颗球转。
 *   npm run mfl -- stills examples/orbit/index.ts
 *   npm run mfl -- render examples/orbit/index.ts
 *
 * 同一台相机同时管三种东西：
 *   - 平面卡片（HTML 文字）和网格（box、sphere）：cam.place() 算出每个物体的姿态，都是 perspective 层的直接子元素；
 *   - draw 里画的点环：cam.project() 逐点投影；
 *   - 镜头外的标注：cam.toScreen() 跟住三维里的一点。
 * 35mm 镜头带景深，对焦点从“远”拉到“近”：卡片按自己的深度糊，点环按 cam.blurAt() 摊成光斑。
 * 卡片要用 cam.scene() 组装，它负责修正 flexlayer 三维平面上 blur 的倍数。
 * 震屏仍交给外面一层 shot() 的 view：三维取景窗是它的舞台。
 */
import { box, defineComposition, fade, fx, h, keyframes, place, pulse, shot, shot3d, text, wiggle, type Frame } from 'motionflexlayer'

const W = 1920
const H = 1080
const BG = '#0d1017'
const INK = '#eef0f4'
const MUTED = '#8a93a6'
const ACCENT = '#f2b84b'

const FLOOR_Y = 780
const HIT = 4.2

const CARDS = [
  { x: 700, z: -320, title: '远', note: 'z = −320', color: '#22324d' },
  { x: 980, z: 0, title: '中', note: 'z = 0', color: '#2c2f4a' },
  { x: 1250, z: 260, title: '近', note: 'z = 260', color: '#4a2c3a' },
]
const CARD_W = 300
const CARD_H = 200

/** 拉焦：对焦点从“远”移到“近”。 */
function focusPoint(t: number): [number, number, number] {
  const k = keyframes(t, [
    { at: 1.5, value: 0 },
    { at: 5.5, value: 1, ease: 'inOutCubic' },
  ])
  const a = CARDS[0]!
  const b = CARDS[2]!
  return [a.x + (b.x - a.x) * k, FLOOR_Y - CARD_H / 2, a.z + (b.z - a.z) * k]
}

function camera(t: number) {
  return shot3d({
    width: W,
    height: H,
    lens: 35,
    aperture: 10,
    focus: focusPoint(t),
    x: 980,
    y: 640,
    z: 0,
    yaw: keyframes(t, [
      { at: 0, value: -38 },
      { at: 7.5, value: 42, ease: 'inOutSine' },
    ]),
    pitch: keyframes(t, [
      { at: 0, value: 24 },
      { at: 7.5, value: 6, ease: 'inOutSine' },
    ]),
    zoom: keyframes(t, [
      { at: 0, value: 0.8 },
      { at: 7.5, value: 1.15, ease: 'inOutCubic' },
    ]),
  })
}

function card(c: (typeof CARDS)[number]) {
  return box(
    {
      width: CARD_W,
      height: CARD_H,
      background: c.color,
      borderRadius: 28,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    text(c.title, { fontSize: 96, fontWeight: 800, color: INK }),
    text(c.note, { fontSize: 30, color: MUTED }),
  )
}

/** 世界里一圈点：每点都过 cam.project，近大远小、远处更暗。 */
function ring(cam: ReturnType<typeof shot3d>, t: number) {
  const N = 160
  return fx({ width: W, height: H, name: 'ring' }, (ctx) => {
    const pts = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + t * 0.25
      const p = cam.project(980 + 620 * Math.cos(a), 420 + 40 * Math.sin(a * 3 + t), 620 * Math.sin(a))
      if (p) pts.push(p)
    }
    pts.sort((a, b) => b.depth - a.depth)
    for (const p of pts) {
      // 失焦的点摊开成更大、更淡的光斑，亮度总量大致不变。
      const r = 5 * p.scale
      const soft = r + cam.blurAt(p.depth)
      ctx.globalAlpha = Math.min(1, 0.25 + 0.6 * p.scale) * (r / soft) ** 2
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(p.x, p.y, soft, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  })
}

function scene(f: Frame) {
  const t = f.t
  const cam = camera(t)
  const hop = Math.max(0, Math.sin((t - 1) * 2.2)) * 120
  const objects = [
    cam.place(
      { x: 980, y: FLOOR_Y, z: 0, rotateX: 90, width: 1500, height: 1300, sharp: true },
      h('box', { x: 0, y: 0, width: 1500, height: 1300, depth: 16, fill: '#232733' }),
    ),
    ...CARDS.map((c) =>
      cam.place(
        { x: c.x, y: FLOOR_Y - CARD_H / 2 - 8, z: c.z, width: CARD_W, height: CARD_H, attrs: { expect: 'text-overlap: 机位绕到侧面时卡片前后遮挡，斜着的字外接框也会压到一起' } },
        card(c),
      ),
    ),
    cam.place({ x: 1420, y: FLOOR_Y - 8 - 70 - hop, z: -160, width: 140, height: 140, sharp: true }, h('sphere', { cx: 70, cy: 70, r: 70, fill: ACCENT })),
  ]

  const k = pulse(t, [HIT], 7)
  const outer = shot({ width: W, height: H, shakeX: wiggle(t, 14, 26 * k, 1), shakeY: wiggle(t, 14, 18 * k, 2) })

  const near = CARDS[2]!
  const tag = cam.toScreen(near.x, FLOOR_Y - CARD_H - 8, near.z)
  const tagA = fade(t, 1.2, 7.6, 0.4, 0.4)

  return [
    h(
      'layer',
      { width: W, height: H, view: outer.view },
      h('layer', outer.stage, h('rect', { x: 0, y: 0, width: W, height: H, fill: BG }), cam.scene(...objects), ring(cam, t)),
    ),
    tag
      ? place({ x: tag[0], y: tag[1] - 40, anchor: 'bottom', opacity: tagA }, text('cam.toScreen() 跟住卡片顶边', { fontSize: 30, color: ACCENT }))
      : null,
    place(
      { x: 120, y: 110, anchor: 'top-left' },
      text(`shot3d  35mm  yaw ${cam.yaw.toFixed(0)}°  pitch ${cam.pitch.toFixed(0)}°  zoom ${cam.zoom.toFixed(2)}  focus ${cam.focus.toFixed(0)}`, { fontSize: 34, color: MUTED }),
    ),
  ]
}

export default defineComposition({
  id: 'orbit',
  width: W,
  height: H,
  fps: 30,
  duration: 8,
  background: BG,
  color: INK,
  render: (f) => h('layer', { width: W, height: H }, ...scene(f)),
})
