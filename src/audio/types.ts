import type { ScoreInput } from 'visualtone'

export type Stereo = { l: Float32Array; r: Float32Array }

export type SourceContext = {
  sampleRate: number
  /** 合成总时长，秒。 */
  duration: number
  /** 总采样数。 */
  length: number
}

/**
 * 音源：文件路径（相对合成的 baseDir，任何 ffmpeg 能读的格式），
 * 或一个直接生成采样的函数（程序化合成器、预先算好的缓冲）。
 */
export type AudioSource = string | { render: (ctx: SourceContext) => Stereo | Promise<Stereo>; name?: string }

export type AudioClip = {
  src: AudioSource
  /** 在时间轴上从第几秒开始。默认 0。可以是负数：从音源中间开始播。 */
  at?: number
  /** 从音源的第几秒开始取。默认 0。 */
  offset?: number
  /** 取多长，秒。缺省取到音源结束（loop 时取到合成结束）。 */
  duration?: number
  /** 循环音源。BGM 小样铺满全片用。 */
  loop?: boolean
  /** 增益，dB。默认 0。 */
  gain?: number
  /** 声像 -1（左）..1（右）。默认 0。 */
  pan?: number
  /** 淡入、淡出，秒。 */
  fadeIn?: number
  fadeOut?: number
  /** 进哪条母线。默认 'main'。旁白放 'voice'，配乐放 'music'。 */
  bus?: string
}

/** 按时间点闪避：每个时间点把母线压下去，给底鼓、冲击点让路。画面脉冲用同一组时间。 */
export type TimedDuck = {
  times: readonly number[]
  /** 最多压掉多少，0..1。默认 0.5。 */
  depth?: number
  /** 起压时间，秒。默认 0.008。 */
  attack?: number
  /** 压到底后保持多久，秒。默认 0。 */
  hold?: number
  /** 恢复时间，秒。默认 0.18。 */
  release?: number
}

/** 跟着另一条母线或音轨的电平闪避。 */
export type FollowDuck = {
  by: string
  /** 最多压掉多少，0..1。默认 0.5。 */
  depth?: number
  /** 恢复时间，秒。默认 0.25。 */
  release?: number
}

/**
 * 闪避。
 * - `'auto'`（music 母线的缺省）：有 voice 母线时，旁白一开口就压低，并在 2.5 kHz 一带让出人声；
 * - `'off'`：不压；
 * - `{ by }`：跟着另一条母线或音轨的电平压；
 * - `{ times }`：按时间点压。可以和上面任意一种写成数组同时用。
 */
export type Duck = 'auto' | 'off' | FollowDuck | TimedDuck

export type AudioBus = {
  /** dB。 */
  gain?: number
  duck?: Duck | Duck[]
  /** 混响发送 0..1。 */
  space?: number
  /**
   * voice 母线触发其它 music 母线和音轨自动闪避；sfx 不闪避。
   * 缺省按名字猜：voice、vo、narration → voice；music、bgm → music；其余 → sfx。
   */
  role?: 'voice' | 'music' | 'sfx'
}

export type MasterOptions = {
  /** 目标响度，LUFS（BS.1770 积分响度）。默认 -16。 */
  lufs?: number
  /** 限幅器天花板，dBFS。默认 -1。 */
  ceiling?: number
  fadeIn?: number
  fadeOut?: number
}

/** visualtone 的一条音轨：音符、循环、和弦进行、音效。写法见 visualtone 的 README。 */
export type AudioTrack = NonNullable<ScoreInput['tracks']>[number]

export type AudioSection = NonNullable<ScoreInput['sections']>[number]

export type AudioSpec = {
  sampleRate?: number
  clips?: AudioClip[]
  buses?: Record<string, AudioBus>
  /**
   * 直接写 visualtone 的音轨：`notes`、`patterns`（步进串）、`chords`（和弦进行）、`sfx`（内置音效）。
   * id 和母线共用一个命名空间，`duck.by`、`follow` 可以互相引用。
   */
  tracks?: AudioTrack[]
  /** 速度、拍号、swing。缺省用时间轴的 bpm 和每小节拍数。 */
  tempo?: ScoreInput['tempo']
  /** 调性，例如 "D major"、"Em"。写了才检查出调。 */
  key?: string
  /** 段落。缺省用时间轴的段落；名字不是字母开头的段落换成 s0、s1……，只保留边界。 */
  sections?: AudioSection[]
  /** 同一份 seed 同一个结果。 */
  seed?: number
  master?: MasterOptions
}
