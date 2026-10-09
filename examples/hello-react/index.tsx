/**
 * React 写法示例：6 秒的数据片段。
 *   npm run mfl -- stills examples/hello-react/index.tsx
 *   npm run mfl -- render examples/hello-react/index.tsx
 *
 * 要点：
 * - 小写标签是 flexlayer 元素；draw={fn} 闭包原样保留，不会被序列化成字符串
 * - useFrame() 拿当前帧；<Sequence from> 让组件从 0 秒开始写，摆到时间轴上
 * - 每帧都是全新挂载，useMemo / useContext 正常用；useState / useEffect 没有意义（帧之间不保留状态）
 */
import { useMemo } from 'react'
import {
  defineComposition,
  ease,
  fade,
  font,
  progress,
  rgba,
  rng,
  sfx,
  spring,
  springSteps,
  stagger,
  timeline,
} from 'motionflexlayer'
import { Box, Fx, Place, Reveal, Roll, Sequence, Text, fromReact, useFrame } from 'motionflexlayer/react'

const W = 1920
const H = 1080
const BG = '#0b0d12'
const INK = '#f2efe8'
const MUTED = '#8a93a3'
const ACCENT = '#7ee0c3'
const WARM = '#ffb547'

const tl = timeline({ bpm: 120, duration: 6 }).section('in', 0).section('data', 1).section('out', 5)
tl.cue('bar', tl.beats(2, 9, 0.5)).cue('total', tl.beat(9.5)).cue('whoosh', [0.25])

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '13月', '14月']

function Header() {
  const { t } = useFrame()
  const e = spring(t, { damping: 16, stiffness: 140 })
  return (
    <Place x={160} y={170 - (1 - e) * 30} anchor="left" opacity={Math.min(1, t / 0.3)}>
      <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'start', gap: 12 }}>
        <Text style={{ fontSize: 24, color: ACCENT, letterSpacing: 8 }}>MONTHLY RENDERS</Text>
        <Reveal progress={progress(t, 0.15, 0.9, 'outCubic')} width={1100} height={96}>
          <Place x={0} y={48} anchor="left">
            <Text as="h1" style={{ fontSize: 76, fontWeight: 800, color: INK }}>
              每个月渲染的帧数
            </Text>
          </Place>
        </Reveal>
      </Box>
    </Place>
  )
}

/** 柱子：每个 bar cue 长出一根，弹簧过冲；整组用 draw 画，坐标随布局走。 */
function Bars({ values }: { values: number[] }) {
  const { t, tl } = useFrame()
  const hits = tl.times('bar')
  const max = Math.max(...values)
  return (
    <Fx
      name="bars"
      x={W / 2}
      y={640}
      width={1600}
      height={560}
      draw={(ctx, el) => {
        const n = values.length
        const gap = 22
        const bw = (el.w - gap * (n - 1)) / n
        ctx.strokeStyle = rgba(MUTED, 0.25)
        ctx.lineWidth = 1
        for (let k = 0; k <= 4; k++) {
          const y = el.h - 60 - (k / 4) * (el.h - 120)
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(el.w, y)
          ctx.stroke()
        }
        values.forEach((v, i) => {
          const local = t - (hits[i] ?? Infinity)
          const g = spring(local, { damping: 11, stiffness: 170 })
          if (g <= 0) return
          const x = i * (bw + gap)
          const full = (v / max) * (el.h - 120)
          const hgt = full * g
          const y = el.h - 60 - hgt
          const hot = i === n - 1
          const grad = ctx.createLinearGradient(0, y, 0, el.h - 60)
          grad.addColorStop(0, hot ? WARM : ACCENT)
          grad.addColorStop(1, rgba(hot ? WARM : ACCENT, 0.15))
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.roundRect(x, y, bw, hgt, [10, 10, 2, 2])
          ctx.fill()
          ctx.globalAlpha = Math.min(1, local / 0.2)
          ctx.fillStyle = MUTED
          ctx.font = font(20, 500)
          ctx.textAlign = 'center'
          ctx.fillText(MONTHS[i]!, x + bw / 2, el.h - 24)
          ctx.globalAlpha = 1
        })
      }}
    />
  )
}

/** 总数：每根柱子出来滚一格，数字从 0 滚到最终值。 */
function Total({ values }: { values: number[] }) {
  const { t, tl } = useFrame()
  const steps = springSteps(t, tl.times('bar'), { damping: 15, stiffness: 200 })
  const sums = values.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], [0])
  const k = Math.min(values.length, Math.max(0, steps))
  const i = Math.floor(k)
  const value = Math.round(sums[i]! + (sums[Math.min(i + 1, values.length)]! - sums[i]!) * (k - i))
  const done = spring(t - tl.at('total'), { damping: 9, stiffness: 220 })
  return (
    <Place x={W - 160} y={170} anchor="right" scale={1 + (done > 0 ? 0.08 * Math.sin(Math.min(1, done) * Math.PI) : 0)}>
      <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: 6 }}>
        <Text style={{ fontSize: 24, color: MUTED, letterSpacing: 6 }}>TOTAL FRAMES</Text>
        <Text style={{ fontSize: 72, fontWeight: 800, color: done > 0 ? WARM : INK }}>{value.toLocaleString('en-US')}</Text>
      </Box>
    </Place>
  )
}

function Ticker() {
  const { t } = useFrame()
  const labels = ['渲染中', '编码中', '完成']
  const value = springSteps(t, [1.8, 3.6], { damping: 14, stiffness: 200 })
  return (
    <Place x={160} y={H - 90} anchor="left" opacity={fade(t, 0, 99, 0.3)}>
      <Box style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: ACCENT }} />
        <Roll
          value={value}
          cell={36}
          size={200}
          items={labels.map((s) => (
            <Text style={{ fontSize: 24, color: INK, letterSpacing: 4 }}>{s}</Text>
          ))}
        />
      </Box>
    </Place>
  )
}

function Scene() {
  const { t } = useFrame()
  // 每帧都会重新挂载，useMemo 在一帧内去重；跨帧共享的预计算放到模块顶层或 setup 里
  const values = useMemo(() => {
    const r = rng(7)
    return MONTHS.map((_, i) => Math.round(1800 + i * 260 + r() * 900))
  }, [])
  const out = progress(t, 5.2, 5.9, ease.inCubic)
  return (
    <Place x={W / 2} y={H / 2} width={W} height={H} opacity={1 - out}>
      <Sequence from={0.2}>
        <Header />
      </Sequence>
      <Sequence from={0.6}>
        <Ticker />
      </Sequence>
      <Bars values={values} />
      <Total values={values} />
    </Place>
  )
}

export default defineComposition({
  id: 'hello-react',
  width: W,
  height: H,
  fps: 60,
  duration: 6,
  background: BG,
  color: INK,
  timeline: tl,
  render: fromReact(<Scene />),
  audio: ({ tl }) => ({
    clips: [
      { src: '../assets/bgm-loop.wav', at: 0, loop: true, gain: -9, fadeIn: 0.8, bus: 'music' },
      ...sfx('../assets/whoosh.wav', tl.times('whoosh'), { gain: -8 }),
      ...tl.times('bar').map((at, i) => ({
        src: '../assets/tick.wav',
        at,
        gain: -8 + i * 0.3,
        pan: stagger(i, 14, { each: 1 / 13 }) * 1.2 - 0.6,
      })),
      ...sfx('../assets/chime.wav', tl.times('total'), { gain: -5 }),
    ],
    buses: { music: { duck: { times: tl.times('bar'), depth: 0.3, release: 0.12 } } },
    master: { lufs: -16, fadeOut: 0.8 },
  }),
})
