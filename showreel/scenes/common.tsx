import { BAR, BEAT, DURATION, FPS, H, INTRO, OUTRO, SCENES, TITLE, W, bar } from '../timeline.js'
import { PALETTE, alpha, clamp01, ease, fade, n, tween } from '../motion.js'

/** Frames that send a ripple through the dot grid. */
const RIPPLES = [INTRO.dot, TITLE.hit, OUTRO.out]

export const KICKS_FROM = bar(2)
export const KICKS_TO = bar(11)

export function isKick(frame: number) {
  return frame >= KICKS_FROM && frame < KICKS_TO && frame % BEAT === 0
}

/** Picture side of the kick drum: 1 on the beat, decaying over ~5 frames. */
export function kick(frame: number) {
  if (frame < KICKS_FROM || frame >= KICKS_TO + BEAT) return 0
  const since = (frame - KICKS_FROM) % BEAT
  return Math.exp(-since / 4)
}

export function Background({ f }: { f: number }) {
  const k = kick(f)
  return (
    <layer cx={W / 2} cy={H / 2} width={W} height={H}>
      <rect cx={W / 2} cy={H / 2} width={W} height={H} fill="radial-gradient(at 50% 45%, #131826, #07080c)" />
      <rect
        cx={W / 2}
        cy={H / 2}
        width={W}
        height={H}
        fill="radial-gradient(at 50% 46%, #3ecfc4, #3ecfc400)"
        opacity={n(0.02 + 0.07 * k)}
      />
      <layer
        cx={W / 2}
        cy={H / 2}
        width={W}
        height={H}
        draw={(ctx) => {
          const step = 48
          const cx = W / 2
          const cy = H / 2
          for (let y = step / 2; y < H; y += step) {
            for (let x = step / 2; x < W; x += step) {
              const d = Math.hypot(x - cx, y - cy)
              let lift = 0
              for (const r of RIPPLES) {
                const age = f - r
                if (age < 0 || age > 60) continue
                const front = age * 38
                lift += Math.exp(-(((d - front) / 70) ** 2)) * (1 - age / 60)
              }
              const vignette = 1 - clamp01(d / 1100)
              const a = 0.05 + 0.08 * vignette + 0.6 * lift
              ctx.fillStyle = alpha(PALETTE.ink, a)
              const r = 1.4 + 2.2 * lift
              ctx.beginPath()
              ctx.arc(x, y, r, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }}
      />
    </layer>
  )
}

const SECTIONS = [
  { name: '一帧', ...SCENES.intro },
  { name: 'flex', ...SCENES.flex },
  { name: 'depth', ...SCENES.depth },
  { name: 'title', ...SCENES.title },
  { name: 'hello', ...SCENES.outro },
]

function Digits({ text, size, color }: { text: string; size: number; color: string }) {
  return (
    <div style="display:flex; align-items:center">
      {[...text].map((ch) => (
        <p style={`width:${/[.:]/.test(ch) ? Math.round(size * 0.5) : Math.round(size * 0.8)}px; font-size:${size}px; color:${color}; text-align:center`}>
          {ch}
        </p>
      ))}
    </div>
  )
}

const TRACK = { x0: 160, x1: W - 160, y: 1004 }

export function Hud({ f }: { f: number }) {
  const show = fade(f, 4, DURATION - 6, 14)
  if (show <= 0) return null
  const secs = f / FPS
  const tc = `${String(Math.floor(secs)).padStart(2, '0')}.${String(Math.floor((secs % 1) * 100)).padStart(2, '0')}`
  const x = (frame: number) => TRACK.x0 + (TRACK.x1 - TRACK.x0) * (frame / DURATION)
  const head = x(f)
  const k = kick(f)
  return (
    <layer cx={W / 2} cy={H / 2} width={W} height={H} opacity={n(show)}>
      <layer cx={TRACK.x0} cy={70} anchor="left">
        <div style="display:flex; align-items:center; gap:14px">
          <div style={`width:12px; height:12px; border-radius:6px; background:${PALETTE.teal}`}></div>
          <p style={`font-size:22px; letter-spacing:6px; color:${PALETTE.ink}`}>MOTIONFLEXLAYER</p>
          <p style={`font-size:22px; letter-spacing:3px; color:${PALETTE.muted}`}>showreel</p>
        </div>
      </layer>
      <layer cx={TRACK.x1} cy={70} anchor="right">
        <div style="display:flex; align-items:center; gap:22px">
          <Digits text={tc} size={24} color={PALETTE.ink} />
          <Digits text={`F${String(f).padStart(3, '0')}`} size={24} color={PALETTE.muted} />
        </div>
      </layer>
      <layer cx={W / 2} cy={TRACK.y} width={W} height={60}>
        <line x1={TRACK.x0} y1={30} x2={TRACK.x1} y2={30} stroke={PALETTE.dim} stroke-width="2" />
        <line x1={TRACK.x0} y1={30} x2={n(head)} y2={30} stroke={alpha(PALETTE.ink, 0.55)} stroke-width="2" />
        {Array.from({ length: Math.floor(DURATION / BAR) + 1 }, (_, i) => (
          <line x1={n(x(i * BAR))} y1={24} x2={n(x(i * BAR))} y2={36} stroke={PALETTE.dim} stroke-width="2" />
        ))}
        <circle cx={n(head)} cy={30} r={n(6 + 3 * k)} fill={PALETTE.teal} glow={`${n(10 + 18 * k)} #3ecfc4`} />
      </layer>
      {SECTIONS.map((s) => {
        const active = f >= s.from && f < s.to
        const on = active ? tween(f, s.from, 8, ease.outCubic) : 0
        return (
          <layer cx={n(x(s.from) + 4)} cy={TRACK.y - 24} anchor="left" opacity={n(0.55 + 0.45 * on)}>
            <p style={`font-size:20px; letter-spacing:3px; color:${active ? PALETTE.ink : PALETTE.muted}`}>
              {s.name}
            </p>
          </layer>
        )
      })}
    </layer>
  )
}

/** A white flash that covers the cut into a new scene. */
export function Flash({ f, at, length = 10, peak = 1 }: { f: number; at: number; length?: number; peak?: number }) {
  const a = f < at ? 0 : peak * (1 - tween(f, at, length, ease.outCubic))
  if (a <= 0.001) return null
  return <rect cx={W / 2} cy={H / 2} width={W} height={H} fill={PALETTE.ink} opacity={n(a)} />
}
