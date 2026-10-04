import { H, INTRO, SCENES, W } from '../timeline.js'
import { BOUNCY, PALETTE, SNAPPY, alpha, clamp01, ease, lerp, n, pop, popVelocity, tween } from '../motion.js'

const FRAME = { cx: W / 2, cy: H / 2 - 20, w: 800, h: 450 }
const TOP = FRAME.cy - FRAME.h / 2

/** Point along the frame outline, starting at top centre and running clockwise. */
function outlinePoint(d: number): [number, number] {
  const { w, h, cx, cy } = FRAME
  const per = 2 * (w + h)
  let s = ((d % per) + per) % per
  const left = cx - w / 2
  const right = cx + w / 2
  const top = cy - h / 2
  const bottom = cy + h / 2
  if (s < w / 2) return [cx + s, top]
  s -= w / 2
  if (s < h) return [right, top + s]
  s -= h
  if (s < w) return [right - s, bottom]
  s -= w
  if (s < h) return [left, bottom - s]
  s -= h
  return [left + s, top]
}

function Outline({ f }: { f: number }) {
  const k = tween(f, INTRO.trace + 4, 20, ease.inOutCubic)
  if (f < INTRO.trace + 4) return null
  const half = (FRAME.w + FRAME.h) * k
  const pens = k < 1 ? [outlinePoint(half), outlinePoint(-half)] : []
  return (
    <layer
      cx={W / 2}
      cy={H / 2}
      width={W}
      height={H}
      draw={(ctx) => {
        ctx.strokeStyle = alpha(PALETTE.ink, 0.9)
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        for (const dir of [1, -1]) {
          ctx.beginPath()
          const steps = 80
          for (let i = 0; i <= steps; i++) {
            const [x, y] = outlinePoint(dir * half * (i / steps))
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
        for (const [x, y] of pens) {
          ctx.shadowColor = PALETTE.teal
          ctx.shadowBlur = 18
          ctx.fillStyle = PALETTE.ink
          ctx.beginPath()
          ctx.arc(x, y, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }}
    />
  )
}

function Corners({ f }: { f: number }) {
  const { cx, cy, w, h } = FRAME
  const arm = 34
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  return (
    <>
      {corners.map(([sx, sy], i) => {
        const at = INTRO.corners[i]!
        if (f < at) return null
        const k = pop(f, at, SNAPPY)
        const off = (1 - k) * 60 + 18
        const x = cx + sx * (w / 2 + off)
        const y = cy + sy * (h / 2 + off)
        return (
          <layer cx={0} cy={0} anchor="top-left" width={W} height={H} opacity={n(clamp01(k * 2))}>
            <polyline
              points={`${n(x)},${n(y - sy * arm)} ${n(x)},${n(y)} ${n(x - sx * arm)},${n(y)}`}
              stroke={PALETTE.teal}
              stroke-width="4"
              fill="none"
            />
          </layer>
        )
      })}
    </>
  )
}

function Caption({ f }: { f: number }) {
  const at = INTRO.shapes[0]! - 8
  if (f < at) return null
  const inK = tween(f, at, 12, ease.outCubic)
  const swap = tween(f, INTRO.wake, 10, ease.inOutCubic)
  const lineH = 44
  const x = FRAME.cx - FRAME.w / 2 + 32
  const y = TOP + 34
  return (
    <layer cx={n(x)} cy={n(y)} anchor="top-left" width={360} height={lineH} opacity={n(inK)}>
      <mask>
        <rect cx={180} cy={lineH / 2} width={360} height={lineH} />
      </mask>
      <layer cx={0} cy={n(-swap * lineH + (1 - inK) * 16)} anchor="top-left">
        <div style="display:flex; align-items:center; gap:14px">
          <p style={`font-size:30px; color:${PALETTE.ink}`}>一帧</p>
          <p style={`font-size:20px; letter-spacing:2px; color:${PALETTE.muted}`}>flexlayer</p>
        </div>
      </layer>
      <layer cx={0} cy={n((1 - swap) * lineH)} anchor="top-left">
        <div style="display:flex; align-items:center; gap:14px">
          <p style={`font-size:30px; color:${PALETTE.teal}`}>动起来</p>
          <p style={`font-size:20px; letter-spacing:2px; color:${PALETTE.muted}`}>motionflexlayer</p>
        </div>
      </layer>
    </layer>
  )
}

function Scrubber({ f }: { f: number }) {
  if (f < INTRO.wake) return null
  const y = FRAME.cy + FRAME.h / 2 + 44
  const x0 = FRAME.cx - FRAME.w / 2
  const draw = tween(f, INTRO.wake, 10, ease.outExpo)
  const head = tween(f, INTRO.wake + 4, INTRO.push - INTRO.wake - 4, (k) => k)
  const hx = x0 + FRAME.w * head
  return (
    <layer cx={W / 2} cy={H / 2} width={W} height={H}>
      <line x1={x0} y1={y} x2={n(x0 + FRAME.w * draw)} y2={y} stroke={PALETTE.dim} stroke-width="3" />
      <line x1={x0} y1={y} x2={n(hx)} y2={y} stroke={PALETTE.teal} stroke-width="3" />
      {Array.from({ length: 9 }, (_, i) => {
        const tx = x0 + (FRAME.w * i) / 8
        if (tx > x0 + FRAME.w * draw) return null
        return <line x1={n(tx)} y1={y - 8} x2={n(tx)} y2={y + 8} stroke={PALETTE.dim} stroke-width="2" />
      })}
      <circle cx={n(hx)} cy={y} r="8" fill={PALETTE.ink} glow="16 #3ecfc4" opacity={n(draw)} />
    </layer>
  )
}

/** The three shapes of the still frame, which wake up once the playhead starts. */
function Shapes({ f }: { f: number }) {
  const live = Math.max(0, f - INTRO.wake)
  const [s0, s1, s2] = INTRO.shapes as [number, number, number]
  const cy = FRAME.cy + 30

  const k0 = pop(f, s0)
  const bounce = Math.abs(Math.sin((live / 15) * Math.PI))
  const vy = live > 0 ? Math.cos((live / 15) * Math.PI) * Math.sign(Math.sin((live / 15) * Math.PI)) : 0
  const squash = live > 0 ? 0.22 * (1 - bounce) ** 6 : 0
  const stretch = 0.08 * Math.abs(vy) * (live > 0 ? 1 : 0)
  const cy0 = cy + 40 - bounce * 110 * clamp01(live / 6)
  const r0 = 62 * k0

  const k1 = pop(f, s1)
  const spin = tween(f, INTRO.wake + 2, 22, ease.inOutCubic) * 180
  const color1 = live > 0 ? PALETTE.blue : PALETTE.blue

  const k2 = pop(f, s2)
  const orbit = live / 30
  const tx = 1170 + Math.sin(orbit * Math.PI * 2) * 16 * clamp01(live / 8)
  const tScale = 1 + 0.18 * Math.sin(orbit * Math.PI * 4) * clamp01(live / 8)
  const tri = (cx: number, cyy: number, r: number) =>
    [0, 1, 2]
      .map((i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3 + orbit * 2.2
        return `${n(cx + Math.cos(a) * r)},${n(cyy + Math.sin(a) * r)}`
      })
      .join(' ')

  return (
    <>
      {f >= s0 && (
        <ellipse
          cx={750}
          cy={n(cy0 + squash * r0)}
          rx={n(r0 * (1 + squash - stretch))}
          ry={n(r0 * (1 - squash + stretch))}
          fill="radial-gradient(at 35% 30%, #b8fff7, #3ecfc4)"
          glow={`${n(20 + 30 * (1 - bounce) * clamp01(live))} #3ecfc455`}
        />
      )}
      {f >= s1 && (
        <layer cx={960} cy={n(cy)} width={160} height={160} scale={n(k1)} rotate={n(spin)} origin="center">
          <rect cx={80} cy={80} width={150} height={150} rx={24} fill={`linear-gradient(to bottom, #a9c1ff, ${color1})`} />
        </layer>
      )}
      {f >= s2 && (
        <layer cx={W / 2} cy={H / 2} width={W} height={H}>
          <polygon points={tri(tx, cy, 86 * k2 * tScale)} fill="linear-gradient(to bottom, #ffb3a7, #ff8a7a)" />
        </layer>
      )}
    </>
  )
}

function Dot({ f }: { f: number }) {
  if (f < INTRO.dot || f >= INTRO.trace + 6) return null
  const k = pop(f, INTRO.dot, BOUNCY)
  const rise = tween(f, INTRO.trace - 2, 8, ease.inExpo)
  const y = lerp(FRAME.cy, TOP, rise)
  const ringK = tween(f, INTRO.dot, 26, ease.outExpo)
  const v = popVelocity(f, INTRO.dot, BOUNCY)
  return (
    <>
      <circle
        cx={W / 2}
        cy={n(FRAME.cy)}
        r={n(14 + 190 * ringK)}
        fill="none"
        stroke={PALETTE.ink}
        stroke-width={n(3 * (1 - ringK) + 0.2)}
        opacity={n(1 - ringK)}
      />
      <ellipse
        cx={W / 2}
        cy={n(y)}
        rx={n(12 * k * (1 - 0.3 * rise))}
        ry={n(12 * k * (1 + 1.4 * rise) * (1 + v * 0.4))}
        fill={PALETTE.ink}
        glow="26 #3ecfc4"
      />
    </>
  )
}

export function Intro({ f }: { f: number }) {
  const push = tween(f, INTRO.push, SCENES.intro.to - INTRO.push, ease.inExpo)
  const scale = 1 + push * 22
  return (
    <layer cx={W / 2} cy={n(H / 2 - 10 * scale * push)} width={W} height={H} scale={n(scale)} origin="center">
      <Outline f={f} />
      <Corners f={f} />
      <Caption f={f} />
      <Shapes f={f} />
      <Scrubber f={f} />
      <Dot f={f} />
    </layer>
  )
}

export const INTRO_FRAME = FRAME
