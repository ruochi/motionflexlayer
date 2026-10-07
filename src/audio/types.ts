import type { Track } from 'visualtone'

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
  /** 在时间轴上从第几秒开始。默认 0。 */
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
  /** 只用于报告。 */
  label?: string
}

/**
 * 闪避（ducking）。
 * - times：按时间点闪避，最常见的是给底鼓让路，传 tl.times('kick')。画面脉冲用同一组时间。
 * - by：按另一条母线（或 tracks 里的音轨）的电平闪避，旁白来了压低音乐。
 */
export type Duck = {
  times?: readonly number[]
  by?: string
  /** 最多压掉多少，0..1。默认 0.5。 */
  depth?: number
  /** times 模式：起压时间，秒。默认 0.008。 */
  attack?: number
  /** 压住后保持多久，秒。by 模式默认 0.25，避免旁白字间一松一紧。 */
  hold?: number
  /** 恢复时间，秒。默认 0.18。 */
  release?: number
  /** by 模式：只压这个频段（Hz），其余频段原样保留。给旁白让路写 [1000, 4000]。 */
  band?: [number, number]
}

/** 母线编译成 visualtone 的一条音轨，下面这些字段原样交给它。 */
type TrackStrip = Pick<Track, 'eq' | 'comp' | 'space' | 'room' | 'echo'>

export type AudioBus = TrackStrip & {
  /** dB。 */
  gain?: number
  duck?: Duck | Duck[]
  /** 分析时按这个归类。缺省按名字猜：voice/vo → voice，music/bgm → music，sfx/fx → sfx。 */
  role?: 'voice' | 'music' | 'sfx'
}

export type MasterOptions = {
  /** 目标响度，LUFS（BS.1770 积分响度）。默认 -16。 */
  lufs?: number
  /** 限幅器天花板，dBFS。默认 -1。 */
  ceiling?: number
  /** 总线饱和 0..1。默认 0，旁白要干净。 */
  drive?: number
  fadeIn?: number
  fadeOut?: number
  reverb?: NonNullable<VisualtoneMaster>['reverb']
  room?: NonNullable<VisualtoneMaster>['room']
  delay?: NonNullable<VisualtoneMaster>['delay']
  eq?: NonNullable<VisualtoneMaster>['eq']
  comp?: NonNullable<VisualtoneMaster>['comp']
}

type VisualtoneMaster = import('visualtone').Score['master']

export type AudioSpec = {
  sampleRate?: number
  /** 只在 tracks 里用了小节记法（at: "4:2"、len: "1/8"）时需要。通常传 tl.bpm。 */
  bpm?: number
  clips?: AudioClip[]
  buses?: Record<string, AudioBus>
  /**
   * 直接写 visualtone 的音轨：音符、曲线、内置音效（sfx: whoosh / riser / impact / pop / tick……）。
   * id 和母线共用一个命名空间，duck.by 可以互相引用。
   */
  tracks?: Track[]
  master?: MasterOptions
}
