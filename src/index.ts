export * from './math.js'
export { ease, cubicBezier, steps, backIn, resolveEase, type Ease, type EaseName } from './ease.js'
export {
  progress,
  tween,
  fade,
  spring,
  springDuration,
  stagger,
  keyframes,
  wiggle,
  oscillate,
  since,
  pulse,
  count,
  springSteps,
  type SpringConfig,
  type StaggerOptions,
  type Keyframe,
} from './motion.js'
export { rng, hash, noise1, simplex2, simplex3, curl2 } from './random.js'
export { parseHex, toHex, mixColor, colorRamp, rgba, type RGBA } from './color.js'
export { Timeline, timeline, type Cue, type Section, type SectionState, type TimelineOptions, type TimelineJSON } from './timeline.js'
export {
  defineComposition,
  isComposition,
  loadComposition,
  frameAt,
  nodeAt,
  prepare,
  setEnvelopes,
  envelopesOf,
  totalFrames,
  flatten,
  type Composition,
  type CompositionSpec,
  type Frame,
  type RenderOutput,
  type LintProfile,
} from './composition.js'
export {
  h,
  css,
  place,
  text,
  box,
  fx,
  shot,
  roll,
  reveal,
  typewriter,
  tokenLength,
  type Anchor,
  type Origin,
  originAttr,
  type Child,
  type StyleObject,
  type PlaceOptions,
  type FxOptions,
  type ShotOptions,
  type Shot,
  type RollOptions,
  type RevealOptions,
  type Token,
  type DrawFn,
  type FvgChild,
  type FvgNode,
} from './nodes.js'
export {
  font,
  measureGlyphs,
  drawGlyphs,
  strokeGlow,
  glowDot,
  sampleTextPoints,
  type Glyph,
  type GlyphStyle,
  type DrawGlyphsOptions,
  type TextPointsOptions,
} from './drawkit.js'
export { DEFAULT_FONT, createCanvas, loadImage, registerFont, ensureFonts, type Canvas2D, type OffscreenCanvas } from './canvas.js'
export { renderFrame, renderRgba, type FrameResult, type RgbaFrame } from './render/frame.js'
export { renderStills, contactSheet, type StillsOptions, type StillsResult } from './render/stills.js'
export { renderVideo, type VideoOptions, type VideoResult } from './render/video.js'
export { IssueLog, type IssueStat } from './render/issues.js'
export { ffmpegPath } from './render/ffmpeg.js'
export { mixAudio, compileAudio, audioSpecOf, duckKeyframes, sfx, dbToGain, gainToDb, type MixResult, type MixOptions } from './audio/mixer.js'
export { renderAudio, type RenderAudioResult } from './audio/render.js'
export { AudioFrame, type Envelopes } from './audio/envelopes.js'
export { analyzeAudio, formatAudioReport, drawWaveform, type AudioReport } from './audio/analyze.js'
export { encodeWav } from './audio/wav.js'
export { decodeAudio } from './audio/decode.js'
export type { AudioSpec, AudioClip, AudioBus, AudioSource, Duck, MasterOptions, Stereo, SourceContext } from './audio/types.js'
export {
  narration,
  alignWords,
  subtitleChars,
  subtitleTrack,
  subtitleAt,
  charProgress,
  toVtt,
  Narration,
  type NarrationLine,
  type NarrationOptions,
  type PlannedLine,
  type PlannedWord,
  type SubtitleWord,
  type SubtitleChar,
  type SubtitleLine,
  type SubtitleTrack,
  type SubtitleNow,
} from './voice/narration.js'
export { edgeTts, synthesizeCached, probeDuration, ttsKey, type TtsEngine, type TtsRequest, type TtsResult, type SpokenWord } from './voice/tts.js'
