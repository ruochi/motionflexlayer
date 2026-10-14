/**
 * 配乐跟着画面的拍走，不先选一首再去对。
 * 段 3 把鼓拿掉，14.0 的正拍才有地方落地。
 */
import { synthSource, type Synth } from '../synth/index.js'
import { LINE_TEXT, TYPE_STEP, tl } from './timeline.js'

const typeTimes = Array.from({ length: LINE_TEXT.length }, (_, i) => tl.at('type') + i * TYPE_STEP)

export function arrange(syn: Synth) {
  // 段 1 只有铺底和打字
  syn.pad(0.15, 5.7, [57, 60, 64, 69], 0.14, 880, 0.9, 1.1)
  for (const [i, t] of typeTimes.entries()) syn.tick(t, 0.045, ((i % 5) - 2) * 0.12)
  syn.ping(tl.at('send'), 79, 0.12, 0.2)

  // 段 2 一拍一步，拨弦往上走
  const climb = [67, 69, 72, 74, 79]
  tl.times('row').forEach((t, i) => {
    syn.kick(t + 0.012, 0.72)
    syn.hat(t + 0.008, 0.08, false, i % 2 ? 0.25 : -0.2)
    syn.pluck(t + 0.04, climb[i] ?? 79, 0.11, (i - 2) * 0.15)
    syn.bass(t, 0.32, 45, 0.22)
  })
  syn.whoosh(tl.at('whip'), 0.4, 0.32, 0.25, -0.5)

  // 段 3 鼓退出，只留帽子；红线甩过去，卡上的时候才有一下
  for (let t = 6; t < 9.4; t += 0.25) syn.hat(t + ((t * 10) % 3) * 0.004, 0.045, false, 0.1)
  syn.pad(6.05, 3.3, [57, 60, 64], 0.07, 1500, 0.5, 0.7)
  syn.whoosh(tl.at('line'), 0.7, 0.4, -0.7, 0.4, 420, 2800)
  syn.riser(7.2, 8.0, 0.12, 280, 2400)
  syn.impact(tl.at('snap'), 0.85, 1)
  syn.bell(tl.at('snap'), 76, 0.16, 0, 1.8, 1.1)

  // 段 4 鼓回来，和弦亮一档
  syn.pad(9.5, 2.9, [60, 64, 67, 72], 0.16, 1700, 0.04, 0.55)
  for (let t = 9.5; t < 12.4; t += 0.5) {
    const n = Math.round(t * 2)
    syn.kick(t + 0.01, n % 2 === 0 ? 0.8 : 0.55)
    syn.hat(t + 0.25, 0.07, false, n % 2 ? 0.3 : -0.15)
    if (n % 2 === 1) syn.clap(t, 0.28)
    syn.bass(t, 0.28, n % 4 === 0 ? 43 : 50, 0.2)
  }
  syn.bell(tl.at('badge'), 84, 0.22, 0.35, 1.6, 1)

  // 段 5 先空出来，正拍上才落下
  syn.riser(13.35, 14.0, 0.14, 240, 1800)
  syn.impact(tl.at('rule'), 1, 1.15)
  syn.pad(14.0, 1.15, [48, 60, 64, 67, 72], 0.26, 1400, 0.02, 1.5)
  syn.bell(tl.at('rule'), 79, 0.2, 0, 2.4, 1.2)
  syn.bell(tl.at('cta'), 84, 0.08, 0.2, 1.6, 0.7)
}

export const score = synthSource(arrange, { seed: 11, name: 'brand' })
