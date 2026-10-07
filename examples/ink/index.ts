/**
 * 着墨：九个镜头，每个镜头展示一件换成网页（Remotion、HyperFrames）或手写 canvas 要多费不少力气的事。
 *   npm run mfl -- stills examples/ink/index.ts --cues
 *   npm run mfl -- check  examples/ink/index.ts
 *   npm run mfl -- audio  examples/ink/index.ts
 *   npm run mfl -- render examples/ink/index.ts
 *
 *   script.ts  文案和旁白。镜头里的动作都卡在旁白的词上。
 *   type.ts    片头、字落位、重排、描边：glyph() 拆字，canvas.create() 求每个字的格子，ink-stroke 合并描边。
 *   optics.ts  玻璃折射、立体字：glass、extrude、perspective。
 *   page.ts    镜头推向排版算出的一点、按着墨对齐、收尾：origin="x y"、checkFvg()、anchor-box="ink"。
 *   sound.ts   配乐和音效，用的是画面的时间点。
 *
 * 几处衔接：片头的书法字飞进段落里自己的格子；竖排里的三个字留下来做描边；描边漫开成下一段的红底；
 * 立体字转回正面、缩回平面，正好是下一页里那个放大了 15 倍的“墨”；镜头停在“这里”，盒子和着墨引出报告。
 */
import { defineComposition } from 'motionflexlayer'
import { C, chapter, dots, H, subtitle, vo, W } from './kit.js'
import { opticsScenes } from './optics.js'
import { pageScenes } from './page.js'
import { tracks } from './sound.js'
import { typeScenes } from './type.js'

export default defineComposition({
  width: W,
  height: H,
  fps: 30,
  duration: vo.duration,
  background: C.night,
  color: C.paper,
  timeline: vo.timeline(),
  render: (f) => [...typeScenes(f), ...opticsScenes(f), ...pageScenes(f), ...chapter(f), dots(f), subtitle(f)],
  audio: () => ({
    clips: vo.clips(),
    buses: { voice: { comp: { threshold: -24, ratio: 2.5, attackMs: 8, releaseMs: 120, knee: 6, makeup: 0 } } },
    tracks: tracks(),
    master: { lufs: -16, fadeOut: 1.5, reverb: { size: 0.7, decay: 0.5, preDelayMs: 30, damping: 0.45, width: 0.9 } },
  }),
})
