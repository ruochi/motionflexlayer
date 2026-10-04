import type { Box, Cell } from './layouts.js'
import { computeFlexLayouts } from './layouts.js'
import { PALETTE } from './motion.js'
import { Background, Flash, Hud } from './scenes/common.js'
import { Depth } from './scenes/depth.js'
import { Flex } from './scenes/flex.js'
import { Intro } from './scenes/intro.js'
import { Outro, computeHelloLayout } from './scenes/outro.js'
import { Title, computeTitleLayout, type TitleLayout } from './scenes/title.js'
import { H, OUTRO, SCENES, TITLE, W } from './timeline.js'

export type Precomputed = { flex: Box[][]; title: TitleLayout; hello: Cell }

/** Everything Yoga has to measure before the first frame: flex states, letters, chips. */
export async function precompute(): Promise<Precomputed> {
  return { flex: await computeFlexLayouts(), title: await computeTitleLayout(), hello: await computeHelloLayout() }
}

const within = (f: number, from: number, to: number) => f >= from && f < to

export function frame(f: number, data: Precomputed) {
  return (
    <layer width={W} height={H} background={PALETTE.bg} color={PALETTE.ink}>
      <Background f={f} />
      {within(f, SCENES.intro.from, SCENES.intro.to) && <Intro f={f} />}
      {within(f, SCENES.flex.from, SCENES.flex.to) && <Flex f={f} layouts={data.flex} />}
      {within(f, SCENES.depth.from, SCENES.depth.to) && <Depth f={f} flat={data.flex[data.flex.length - 1]!} />}
      {within(f, SCENES.title.from, OUTRO.collapse + 30) && <Title f={f} layout={data.title} />}
      {f >= SCENES.outro.from && <Outro f={f} hello={data.hello} />}
      <Flash f={f} at={TITLE.hit} length={12} />
      <Hud f={f} />
    </layer>
  )
}
