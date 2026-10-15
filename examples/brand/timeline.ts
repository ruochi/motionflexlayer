import { timeline } from 'motionflexlayer'

export const W = 1920
export const H = 1080
export const DUR = 15

/** 120 BPM，一拍 0.5 秒。段界和落幅都在拍上。14.0 是第 7 小节的正拍，红线在这里卡上。 */
export const tl = timeline({ bpm: 120, duration: DUR })
  .section('point', 0)
  .section('checks', 3)
  .section('snap', 6)
  .section('places', 9.5)
  .section('lockup', 12.5)

const seen = { audit: false }
tl.cue('kicker', 0.2, seen)
  .cue('headline', 0.45, seen)
  .cue('frameIn', 0.9, seen)
  .cue('bracket', 1.25, seen)
  .cue('type', 1.45, seen)
  .cue('send', 2.5)
  .cue('dock', 3.05, seen)
  .cue('row', [3.25, 3.75, 4.25, 4.75, 5.25])
  .cue('whip', 5.7)
  .cue('act3', 6.15, seen)
  .cue('line', 6.45)
  .cue('count', 7.35, seen)
  .cue('snap', 8.0)
  .cue('grid', 8.55, seen)
  .cue('act4', 9.6, seen)
  .cue('phone', 9.75, seen)
  .cue('web', 10.2, seen)
  .cue('slide', 10.65, seen)
  .cue('badge', 11.2)
  .cue('collapse', 12.55, seen)
  .cue('logo', 13.2, seen)
  .cue('name', 13.45, seen)
  .cue('slogan', 13.75, seen)
  .cue('rule', 14.0)
  .cue('cta', 13.85)

export const TYPE_STEP = 0.06
export const LINE_TEXT = '主按钮偏右 12 像素'

export const CHECKS = ['间距', '字号', '对比', '安全区', '叠压'] as const
