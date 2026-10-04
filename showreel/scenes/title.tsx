import type { Cell, Letter } from '../layouts.js'
import { computeLetters, measureRow } from '../layouts.js'
import { H, OUTRO, SCENES, TITLE, W } from '../timeline.js'
import { BOUNCY, PALETTE, alpha, clamp01, ease, lerp, mix, n, pop, rand, tween } from '../motion.js'
import { kick } from './common.js'

export const WORD = 'motionflexlayer'
const MOTION = 'motion'.length
const LETTER_STYLE = 'font-size:156px; font-weight:700'
const TITLE_Y = 440
const CHIPS = ['spring()', 'interpolate()', 'sequence()', 'perspective', '<draw>']
const CHIP_Y = 760
const CHIP_STYLE = 'display:flex; padding:12px 26px; border-radius:30px; background:#161b26'
const CHIP_TEXT = 'font-size:30px'

export type TitleLayout = { letters: Letter[]; chips: Cell[] }

export async function computeTitleLayout(): Promise<TitleLayout> {
  const letters = await computeLetters(WORD, LETTER_STYLE, TITLE_Y, 2)
  const chips = await measureRow(
    CHIPS.length,
    (i, id) => `<div id="${id}" style="${CHIP_STYLE}"><p style="${CHIP_TEXT}">${CHIPS[i]!.replace('<', '&lt;').replace('>', '&gt;')}</p></div>`,
    CHIP_Y,
    20,
  )
  return { letters, chips }
}

/** How far each letter has collapsed into the centre at the start of the outro (0..1). */
export function collapse(f: number, i: number, count: number) {
  const mid = (count - 1) / 2
  const at = OUTRO.collapse + (mid - Math.abs(i - mid)) * 1.4
  return tween(f, at, 12, (k) => ease.inBack(k, 1.4))
}

function Letters({ f, letters }: { f: number; letters: Letter[] }) {
  const wave = (f - (TITLE.underline + 30)) / 2.2
  return (
    <>
      {letters.map((l, i) => {
        const start = TITLE.hit + 3 + i * TITLE.letterStagger
        if (f < start) return null
        const p = pop(f, start, BOUNCY)
        const c = collapse(f, i, letters.length)
        const float = Math.sin(f / 9 + i * 0.55) * 5 * clamp01((f - start - 20) / 20)
        const x = lerp(l.cx, W / 2, c)
        const y = lerp(l.cy + (1 - p) * 170 + float, TITLE_Y, c)
        const scale = (0.25 + 0.75 * p) * (1 - c)
        const rotate = (1 - p) * (i % 2 ? 26 : -26)
        const hi = wave > -3 ? Math.exp(-(((((wave % 40) + 40) % 40) - i) ** 2) / 3) : 0
        const base = i < MOTION ? PALETTE.teal : PALETTE.ink
        const color = mix(base, PALETTE.gold, hi * 0.85)
        if (scale <= 0.01) return null
        return (
          <layer cx={n(x)} cy={n(y)} scale={n(scale)} rotate={n(rotate)} origin="center" opacity={n(clamp01(p * 2.5))}>
            <p style={`${LETTER_STYLE}; color:${color}`}>{l.ch}</p>
          </layer>
        )
      })}
    </>
  )
}

function Burst({ f }: { f: number }) {
  const age = f - TITLE.hit
  if (age < 0 || age > 80) return null
  const ringK = tween(f, TITLE.hit, 36, ease.outExpo)
  return (
    <>
      {ringK < 0.98 && (
        <circle
          cx={W / 2}
          cy={TITLE_Y}
          r={n(20 + 1300 * ringK)}
          fill="none"
          stroke={alpha(PALETTE.ink, 0.7 * (1 - ringK))}
          stroke-width={n(36 * (1 - ringK) + 0.5)}
        />
      )}
      <layer
        cx={W / 2}
        cy={H / 2}
        width={W}
        height={H}
        draw={(ctx) => {
          const drag = 0.88
          const colors = [PALETTE.teal, PALETTE.blue, PALETTE.gold, PALETTE.coral, PALETTE.ink, PALETTE.violet]
          for (let s = 0; s < 90; s++) {
            const life = 30 + rand(s + 3) * 50
            if (age > life) continue
            const a = rand(s) * Math.PI * 2
            const speed = 10 + rand(s + 11) * 38
            const dist = (speed * (1 - drag ** age)) / (1 - drag)
            const x = W / 2 + Math.cos(a) * dist * 1.6
            const y = TITLE_Y + Math.sin(a) * dist + 0.04 * age * age
            const k = 1 - age / life
            const size = (1.5 + rand(s + 5) * 5) * k
            ctx.fillStyle = alpha(colors[s % colors.length]!, k)
            ctx.beginPath()
            ctx.arc(x, y, size, 0, Math.PI * 2)
            ctx.fill()
          }
        }}
      />
    </>
  )
}

function Underline({ f, letters }: { f: number; letters: Letter[] }) {
  if (f < TITLE.underline) return null
  const first = letters[0]!
  const last = letters[letters.length - 1]!
  const half = (last.cx + last.w / 2 - (first.cx - first.w / 2)) / 2
  const grow = tween(f, TITLE.underline, 18, ease.outExpo)
  const out = tween(f, OUTRO.collapse, 10, ease.inCubic)
  const w = half * grow * (1 - out)
  const y = TITLE_Y + 116
  const split = W / 2 - half + (2 * half * MOTION) / letters.length
  return (
    <layer cx={W / 2} cy={H / 2} width={W} height={H}>
      <line x1={n(W / 2 - w)} y1={y} x2={n(Math.min(split, W / 2 + w))} y2={y} stroke={PALETTE.teal} stroke-width="6" stroke-linecap="round" glow="14 #3ecfc4" />
      {W / 2 + w > split && (
        <line x1={n(split + 12)} y1={y} x2={n(W / 2 + w)} y2={y} stroke={alpha(PALETTE.ink, 0.5)} stroke-width="6" stroke-linecap="round" />
      )}
    </layer>
  )
}

function Subtitle({ f }: { f: number }) {
  const k = tween(f, TITLE.subtitle, 22, ease.outCubic)
  const out = tween(f, OUTRO.collapse, 8, ease.inCubic)
  if (k <= 0 || out >= 1) return null
  return (
    <layer cx={W / 2} cy={n(TITLE_Y + 190 + (1 - k) * 20 + out * 30)} opacity={n(k * (1 - out))}>
      <p style={`font-size:36px; letter-spacing:${n(lerp(22, 6, k))}px; color:${PALETTE.muted}`}>
        flexlayer 画一帧 · motionflexlayer 画每一帧
      </p>
    </layer>
  )
}

function Chips({ f, chips }: { f: number; chips: Cell[] }) {
  const out = tween(f, OUTRO.collapse + 2, 8, ease.inCubic)
  return (
    <>
      {chips.map((c, i) => {
        const at = TITLE.chips[i]!
        if (f < at || out >= 1) return null
        const p = pop(f, at, BOUNCY)
        const lift = 8 * kick(f) * (i % 2 ? 1 : -1) * clamp01((f - at) / 10)
        return (
          <layer cx={n(c.cx)} cy={n(c.cy + (1 - p) * 40 + lift + out * 40)} scale={n(0.4 + 0.6 * p)} origin="center" opacity={n(clamp01(p * 2) * (1 - out))}>
            <div style={CHIP_STYLE}>
              <p style={`${CHIP_TEXT}; color:${i % 2 ? PALETTE.gold : PALETTE.teal}`}>{CHIPS[i]!}</p>
            </div>
          </layer>
        )
      })}
    </>
  )
}

export function Title({ f, layout }: { f: number; layout: TitleLayout }) {
  const drift = 1 + 0.035 * tween(f, TITLE.hit, SCENES.title.to - TITLE.hit, ease.outCubic)
  return (
    <>
      <Burst f={f} />
      <layer cx={W / 2} cy={H / 2} width={W} height={H} scale={n(drift)} origin="center">
        <Letters f={f} letters={layout.letters} />
        <Underline f={f} letters={layout.letters} />
        <Subtitle f={f} />
      </layer>
      <Chips f={f} chips={layout.chips} />
    </>
  )
}

export const TITLE_CENTER_Y = TITLE_Y
