import type { Cell } from '../layouts.js'
import { measureRow } from '../layouts.js'
import { DURATION, H, HELLO, OUTRO, TYPE_RATE, W } from '../timeline.js'
import { BOUNCY, PALETTE, SNAPPY, clamp01, ease, lerp, n, pop, tween } from '../motion.js'
import { TITLE_CENTER_Y } from './title.js'

const HELLO_STYLE = 'font-size:72px; font-weight:700'
const HELLO_Y = 500
const DOT_R = 14
const DOT_GAP = 30

export async function computeHelloLayout(): Promise<Cell> {
  const [cell] = await measureRow(1, (_, id) => `<p id="${id}" style="${HELLO_STYLE}">${HELLO}</p>`, HELLO_Y)
  return cell!
}

export function Outro({ f, hello }: { f: number; hello: Cell }) {
  if (f < OUTRO.dot) return null
  const left = hello.cx - hello.w / 2
  const dotHome = left - DOT_GAP - DOT_R
  const appear = pop(f, OUTRO.dot, BOUNCY)
  const slide = tween(f, OUTRO.type - 8, 10, ease.outExpo)
  const back = tween(f, OUTRO.out - 6, 8, ease.inOutCubic)
  const end = tween(f, OUTRO.out, DURATION - OUTRO.out - 8, ease.inBack)
  const dx = lerp(lerp(W / 2, dotHome, slide), W / 2, back)
  const dy = lerp(lerp(TITLE_CENTER_Y, HELLO_Y, slide), H / 2, back)
  const burst = f >= OUTRO.out ? pop(f, OUTRO.out, SNAPPY) : 0
  const r = DOT_R * appear * (1 + burst * 1.6) * (1 - end)

  const typed = Math.max(0, Math.floor((f - OUTRO.type) * TYPE_RATE))
  const shown = HELLO.slice(0, typed)
  const split = 'Hello, '.length
  const textOut = 1 - back
  const done = typed >= HELLO.length
  const blink = !done || Math.floor(f / 9) % 2 === 0
  const url = tween(f, OUTRO.type + 30, 14, ease.outCubic) * textOut

  return (
    <>
      {f >= OUTRO.type && textOut > 0 && (
        <layer cx={n(left)} cy={HELLO_Y} anchor="left" opacity={n(textOut)}>
          <div style="display:flex; align-items:center; gap:6px">
            <p style={HELLO_STYLE}>
              <span style={`color:${PALETTE.ink}`}>{shown.slice(0, split)}</span>
              <span style={`color:${PALETTE.teal}`}>{shown.slice(split)}</span>
            </p>
            {blink && <div style={`width:6px; height:78px; background:${PALETTE.teal}`}></div>}
          </div>
        </layer>
      )}
      {url > 0 && (
        <layer cx={W / 2} cy={n(HELLO_Y + 96 + (1 - url) * 16)} opacity={n(url)}>
          <p style={`font-size:28px; letter-spacing:4px; color:${PALETTE.muted}`}>github.com/ruochi/motionflexlayer</p>
        </layer>
      )}
      {r > 0.3 && <circle cx={n(dx)} cy={n(dy)} r={n(r)} fill={PALETTE.ink} glow={`${n(24 + 40 * burst)} #3ecfc4`} />}
      {f >= OUTRO.out && (
        <circle
          cx={W / 2}
          cy={H / 2}
          r={n(20 + 600 * tween(f, OUTRO.out, 20, ease.outExpo))}
          fill="none"
          stroke={PALETTE.teal}
          stroke-width={n(4 * (1 - tween(f, OUTRO.out, 20, (k) => k)) + 0.1)}
          opacity={n(clamp01(1 - (f - OUTRO.out) / 20))}
        />
      )}
    </>
  )
}
