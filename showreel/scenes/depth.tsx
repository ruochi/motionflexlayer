import type { Box } from '../layouts.js'
import { STAGE } from '../layouts.js'
import { DEPTH, FLEX_STATES, H, SCENES, W } from '../timeline.js'
import { BLOCK_COLORS, PALETTE, SNAPPY, alpha, clamp01, ease, lerp, mix, n, pop, rand, tween } from '../motion.js'
import { kick } from './common.js'

const RING = { cx: W / 2, cy: 470, r: 400 }
const CARD = { w: 250, h: 340 }
const PERSPECTIVE = 1800
const WORDS = ['spring', 'interpolate', 'sequence', 'perspective', 'mask', 'draw']

/** Resting angles leave a gap at the front, so the core shows between the two nearest cards. */
const restAngle = (i: number) => -30 - i * 60

/** Ring rotation in degrees: a snap on every second beat, then a wind-up into the drop. */
export function spin(f: number) {
  let deg = 0
  for (const at of DEPTH.steps) deg += 60 * clamp01(ease.outBack(tween(f, at, 14, (k) => k), 2.2))
  deg += 900 * ease.inCubic(clamp01((f - DEPTH.windup) / (DEPTH.suck - DEPTH.windup + 10)))
  return deg
}

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

/**
 * flexlayer applies `z` before `rotateY` (like CSS `rotateY(θ) translateZ(z)`), so a ring
 * is every card at the same centre with `z = radius` and its own angle.
 */
function Card({ i, f, flat }: { i: number; f: number; flat: Box }) {
  const k = pop(f, DEPTH.fold + i * 2, SNAPPY)
  const theta = wrap(restAngle(i) + spin(f))
  const x = lerp(flat.x + flat.w / 2, W / 2, k)
  const y = lerp(flat.y + flat.h / 2, H / 2, k)
  const w = lerp(flat.w, CARD.w, k)
  const h = lerp(flat.h, CARD.h, k)
  const z = lerp(0, RING.r, k)
  const rotY = lerp(0, theta, k)
  const facing = Math.cos((rotY * Math.PI) / 180)
  const color = mix(BLOCK_COLORS[i]!, PALETTE.bg, (1 - facing) * 0.4)
  const textOn = clamp01((k - 0.6) * 2.5) * clamp01(facing * 3)
  return (
    <layer cx={n(x)} cy={n(y)} width={n(w)} height={n(h)} z={n(z)} rotateY={n(rotY)}>
      <rect
        cx={n(w / 2)}
        cy={n(h / 2)}
        width={n(w)}
        height={n(h)}
        rx="26"
        fill={`linear-gradient(to bottom, ${mix(color, '#ffffff', 0.3)}, ${color})`}
      />
      {textOn > 0.01 && (
        <layer cx={28} cy={30} anchor="top-left" opacity={n(textOn)}>
          <p style={`font-size:24px; color:${alpha(PALETTE.bg, 0.6)}`}>{`0${i + 1}`}</p>
        </layer>
      )}
      {textOn > 0.01 && (
        <layer cx={28} cy={n(h - 30)} anchor="bottom-left" opacity={n(textOn)}>
          <p style={`font-size:34px; font-weight:700; color:${PALETTE.bg}`}>{WORDS[i]!}</p>
        </layer>
      )}
    </layer>
  )
}

/** Depth used for painter's order: the ring position blended in as the card folds. */
function cardDepth(i: number, f: number) {
  const k = pop(f, DEPTH.fold + i * 2, SNAPPY)
  const theta = wrap(restAngle(i) + spin(f))
  return lerp(0, RING.r * Math.cos((theta * Math.PI) / 180), k)
}

function Warp({ f }: { f: number }) {
  const power = ease.inCubic(clamp01((f - DEPTH.windup) / (SCENES.depth.to - DEPTH.windup)))
  if (power <= 0.01) return null
  return (
    <layer
      cx={W / 2}
      cy={H / 2}
      width={W}
      height={H}
      draw={(ctx) => {
        ctx.lineCap = 'round'
        for (let s = 0; s < 140; s++) {
          const a = rand(s) * Math.PI * 2
          const speed = 18 + rand(s + 99) * 40
          const r = (rand(s + 7) * 1200 + (f - DEPTH.windup) * speed * (0.4 + power)) % 1200
          const len = 10 + power * 220 * (r / 1200)
          const x0 = RING.cx + Math.cos(a) * r
          const y0 = RING.cy + Math.sin(a) * r
          ctx.strokeStyle = alpha(s % 5 === 0 ? PALETTE.teal : PALETTE.ink, 0.15 + 0.6 * power * (r / 1200))
          ctx.lineWidth = 1 + 2 * power
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len)
          ctx.stroke()
        }
      }}
    />
  )
}

function Readout({ f }: { f: number }) {
  const on = tween(f, DEPTH.fold + 10, 10, ease.outCubic) * (1 - tween(f, DEPTH.suck - 6, 8, ease.inCubic))
  if (on <= 0) return null
  const deg = Math.round(((spin(f) % 360) + 360) % 360)
  const y = STAGE.cy + STAGE.h / 2 + 86
  return (
    <>
      <layer cx={STAGE.cx - STAGE.w / 2} cy={n(y + (1 - on) * 18)} anchor="left" opacity={n(on)}>
        <p style="font-size:42px">
          <span style={`color:${PALETTE.teal}`}>perspective</span>
          <span style={`color:${PALETTE.muted}`}>=</span>
          <span style={`color:${PALETTE.gold}`}>"{PERSPECTIVE}"</span>
          <span style={`color:${PALETTE.muted}`}> </span>
          <span style={`color:${PALETTE.teal}`}>rotateY</span>
          <span style={`color:${PALETTE.muted}`}>=</span>
          <span style={`color:${PALETTE.gold}`}>"{deg}"</span>
        </p>
      </layer>
    </>
  )
}

export function Depth({ f, flat }: { f: number; flat: Box[] }) {
  const suck = tween(f, DEPTH.suck, SCENES.depth.to - DEPTH.suck, ease.inBack)
  const scale = Math.max(0.001, 1 - suck)
  const k = kick(f)
  const coreIn = pop(f, DEPTH.fold + 8, SNAPPY)
  const coreR = 70 * coreIn * (1 + 0.14 * k) * (1 + 0.6 * clamp01((f - DEPTH.windup) / 45))
  const cards = flat.map((box, i) => ({ i, box, z: cardDepth(i, f) }))
  cards.sort((a, b) => a.z - b.z)
  const behind = cards.filter((c) => c.z < 0)
  const front = cards.filter((c) => c.z >= 0)
  return (
    <>
      <Warp f={f} />
      <layer cx={W / 2} cy={n(RING.cy)} width={W} height={H} scale={n(scale)} origin="center">
        <ellipse cx={W / 2} cy={n(H / 2 + 300)} rx="620" ry="70" fill="radial-gradient(#3ecfc433, #3ecfc400)" opacity={n(coreIn)} />
        {coreR > 1 && (
          <circle cx={W / 2} cy={H / 2} r={n(coreR * 0.6)} fill="#3ecfc455" glow={`${n(50 + 70 * k)} #3ecfc4`} />
        )}
        <layer cx={W / 2} cy={H / 2} width={W} height={H} perspective={PERSPECTIVE}>
          {behind.map((c) => (
            <Card i={c.i} f={f} flat={offset(c.box)} />
          ))}
          {coreR > 1 && <sphere cx={W / 2} cy={H / 2} r={n(coreR)} fill={PALETTE.teal} />}
          {front.map((c) => (
            <Card i={c.i} f={f} flat={offset(c.box)} />
          ))}
        </layer>
      </layer>
      <Readout f={f} />
    </>
  )
}

/** Flex boxes are in canvas space; the ring group is centred on RING.cy instead of H / 2. */
function offset(b: Box): Box {
  return { ...b, y: b.y + (H / 2 - RING.cy) }
}

export const DEPTH_START = FLEX_STATES[FLEX_STATES.length - 1]!
