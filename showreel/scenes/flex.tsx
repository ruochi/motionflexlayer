import type { Box } from '../layouts.js'
import { STAGE } from '../layouts.js'
import { FLEX_LABELS, FLEX_STAGGER, FLEX_STATES, H, SCENES, TYPE_RATE, W } from '../timeline.js'
import { BLOCK_COLORS, BOUNCY, PALETTE, SNAPPY, alpha, clamp01, ease, lerp, mix, n, pop, popVelocity, tween } from '../motion.js'

const FULL: Box = { x: 0, y: 0, w: W, h: H, r: 0 }

/** Which block leads each transition, so no two changes feel the same. */
function delay(state: number, i: number) {
  switch (state) {
    case 1:
      return (5 - i) * FLEX_STAGGER
    case 3:
      return Math.abs(i - 2.5) * FLEX_STAGGER
    case 5:
      return (2.5 - Math.abs(i - 2.5)) * FLEX_STAGGER
    default:
      return i * FLEX_STAGGER
  }
}

function stateAt(f: number) {
  let s = 0
  for (let i = 0; i < FLEX_STATES.length; i++) if (f >= FLEX_STATES[i]!) s = i
  return s
}

export type BlockPose = { cx: number; cy: number; w: number; h: number; r: number; vx: number; vy: number }

function lerpBox(a: Box, b: Box, k: number) {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k), r: lerp(a.r, b.r, k) }
}

/** Pose of block `i` at a (possibly fractional) frame, interpolated between Yoga layouts by a spring. */
export function blockPose(layouts: Box[][], i: number, f: number): BlockPose {
  const s = stateAt(f)
  const to = layouts[s]![i]!
  let from: Box
  let at = FLEX_STATES[s]! + delay(s, i)
  let config = SNAPPY
  if (s === 0) {
    from = i === 1 ? FULL : { ...to, y: to.y - 760 }
    at = FLEX_STATES[0]! + (i === 1 ? 0 : i * FLEX_STAGGER)
    config = i === 1 ? SNAPPY : BOUNCY
  } else {
    from = layouts[s - 1]![i]!
  }
  const k = pop(f, at, config)
  const v = popVelocity(f, at, config)
  const b = lerpBox(from, to, k)
  const vx = (to.x + to.w / 2 - (from.x + from.w / 2)) * v
  const vy = (to.y + to.h / 2 - (from.y + from.h / 2)) * v
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, r: b.r, vx, vy }
}

/** Squash and stretch along the direction of travel. */
function deform(p: BlockPose) {
  const speed = Math.hypot(p.vx, p.vy)
  const s = Math.min(0.28, speed / 260)
  const horizontal = Math.abs(p.vx) >= Math.abs(p.vy)
  const w = p.w * (horizontal ? 1 + s : 1 - s * 0.45)
  const h = p.h * (horizontal ? 1 - s * 0.45 : 1 + s)
  return { w: Math.max(2, w), h: Math.max(2, h), speed }
}

export function Block({ pose, color, opacity = 1, glow = 0 }: { pose: BlockPose; color: string; opacity?: number; glow?: number }) {
  const d = deform(pose)
  const r = Math.min(pose.r, d.w / 2, d.h / 2)
  return (
    <rect
      cx={n(pose.cx)}
      cy={n(pose.cy)}
      width={n(d.w)}
      height={n(d.h)}
      rx={n(r)}
      fill={`linear-gradient(to bottom, ${mix(color, '#ffffff', 0.32)}, ${color})`}
      opacity={n(opacity)}
      shadow={opacity > 0.9 ? '0 18 36 #00000088' : undefined}
      glow={glow > 0 ? `${n(glow)} ${alpha(color, 0.5)}` : undefined}
    />
  )
}

function Label({ f }: { f: number }) {
  const s = stateAt(f)
  const start = FLEX_STATES[s]! + 4
  const typed = Math.max(0, Math.floor((f - start) * TYPE_RATE))
  const lines: Array<{ text: string; y: number; o: number; shown: number; caret: boolean }> = []
  const exit = tween(f, FLEX_STATES[s]!, 8, ease.inCubic)
  if (s > 0 && exit < 1) lines.push({ text: FLEX_LABELS[s - 1]!, y: -26 * exit, o: 1 - exit, shown: 999, caret: false })
  const enter = tween(f, start, 6, ease.outCubic)
  lines.push({ text: FLEX_LABELS[s]!, y: 18 * (1 - enter), o: enter, shown: typed, caret: true })
  const blink = typed >= FLEX_LABELS[s]!.length ? Math.floor(f / 8) % 2 === 0 : true
  return (
    <>
      {lines.map((line) => {
        const [prop, value] = line.text.split(': ') as [string, string]
        const whole = `${prop}: ${value};`
        const shown = Math.min(line.shown, whole.length)
        const head = whole.slice(0, shown)
        const p1 = head.slice(0, prop.length)
        const p2 = head.slice(prop.length, prop.length + 2)
        const p3 = head.slice(prop.length + 2, prop.length + 2 + value.length)
        const p4 = head.slice(prop.length + 2 + value.length)
        return (
          <layer cx={STAGE.cx - STAGE.w / 2} cy={n(STAGE.cy + STAGE.h / 2 + 86 + line.y)} anchor="left" opacity={n(line.o)}>
            <div style="display:flex; align-items:center; gap:4px">
              <p style="font-size:42px">
                <span style={`color:${PALETTE.teal}`}>{p1}</span>
                <span style={`color:${PALETTE.muted}`}>{p2}</span>
                <span style={`color:${PALETTE.gold}`}>{p3}</span>
                <span style={`color:${PALETTE.muted}`}>{p4}</span>
              </p>
              {line.caret && blink && <div style={`width:4px; height:44px; background:${PALETTE.ink}`}></div>}
            </div>
          </layer>
        )
      })}
      <layer cx={STAGE.cx + STAGE.w / 2} cy={STAGE.cy + STAGE.h / 2 + 86} anchor="right">
        <div style="display:flex; align-items:center; gap:10px">
          <p style={`font-size:28px; color:${PALETTE.ink}`}>{`0${s + 1}`}</p>
          <p style={`font-size:28px; color:${PALETTE.dim}`}>/ 06</p>
        </div>
      </layer>
    </>
  )
}

function Stage({ f }: { f: number }) {
  const k = tween(f, SCENES.flex.from + 6, 12, ease.outCubic)
  const out = tween(f, SCENES.flex.to - 10, 10, ease.inCubic)
  const o = k * (1 - out)
  if (o <= 0) return null
  const pad = 24
  return (
    <>
      <rect
        cx={STAGE.cx}
        cy={STAGE.cy}
        width={n(STAGE.w + pad * 2 + (1 - k) * 60)}
        height={n(STAGE.h + pad * 2 + (1 - k) * 40)}
        rx="20"
        fill="none"
        stroke={alpha(PALETTE.muted, 0.45 * o)}
        stroke-width="2"
        stroke-dasharray="10 12"
      />
      <layer cx={STAGE.cx - STAGE.w / 2 - pad} cy={STAGE.cy - STAGE.h / 2 - pad - 26} anchor="left" opacity={n(o)}>
        <div style="display:flex; align-items:center; gap:10px">
          <p style={`font-size:20px; letter-spacing:2px; color:${PALETTE.muted}`}>div</p>
          <p style={`font-size:20px; letter-spacing:2px; color:${PALETTE.teal}`}>display:flex</p>
          <p style={`font-size:20px; letter-spacing:2px; color:${PALETTE.dim}`}>· yoga</p>
        </div>
      </layer>
    </>
  )
}

export function Flex({ f, layouts }: { f: number; layouts: Box[][] }) {
  const order = [1, 0, 2, 3, 4, 5]
  return (
    <>
      <Stage f={f} />
      {order.map((i) => {
        const pose = blockPose(layouts, i, f)
        const entering = i === 1 && f < FLEX_STATES[1]!
        const trail = !entering && Math.hypot(pose.vx, pose.vy) > 10
        return (
          <>
            {trail && <Block pose={blockPose(layouts, i, f - 2)} color={BLOCK_COLORS[i]!} opacity={0.12} />}
            {trail && <Block pose={blockPose(layouts, i, f - 1)} color={BLOCK_COLORS[i]!} opacity={0.25} />}
            <Block pose={pose} color={BLOCK_COLORS[i]!} />
          </>
        )
      })}
      {f >= FLEX_STATES[0]! + 4 && <Label f={f} />}
      <Flicker f={f} />
    </>
  )
}

/** A thin flash line under the stage on every CSS change, like a cursor commit. */
function Flicker({ f }: { f: number }) {
  const s = stateAt(f)
  const k = tween(f, FLEX_STATES[s]!, 12, ease.outExpo)
  if (s === 0 || k >= 1) return null
  const y = STAGE.cy + STAGE.h / 2 + 40
  const half = (STAGE.w / 2) * k
  return (
    <line
      x1={n(STAGE.cx - half)}
      y1={y}
      x2={n(STAGE.cx + half)}
      y2={y}
      stroke={PALETTE.teal}
      stroke-width="2"
      opacity={n(clamp01(1 - k))}
      glow="12 #3ecfc4"
    />
  )
}
