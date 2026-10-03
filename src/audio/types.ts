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
  /** 进哪条母线。默认 'main'。 */
  bus?: string
  /** 只用于报告。 */
  label?: string
}

/**
 * 闪避（ducking）：在指定时刻把母线音量压下去再放回来。
 * - times：按时间点闪避，最常见的是给底鼓让路，传 tl.times('kick')。画面脉冲用同一组时间。
 * - by：按另一条母线的电平闪避（侧链），人声来了压低音乐。
 */
export type Duck = {
  times?: readonly number[]
  by?: string
  /** 最多压掉多少，0..1。默认 0.5。 */
  depth?: number
  /** 秒。默认 0.008。 */
  attack?: number
  /** 压住后保持多久，秒。默认 0。 */
  hold?: number
  /** 恢复时间常数，秒。默认 0.18。 */
  release?: number
  /** by 模式：触发电平，dBFS。默认 -30。 */
  threshold?: number
}

export type AudioBus = {
  /** dB。 */
  gain?: number
  duck?: Duck | Duck[]
}

export type MasterOptions = {
  /** dB。 */
  gain?: number
  fadeIn?: number
  fadeOut?: number
  /** 先把峰值归一到这个 dBFS（例如 -1），再进限幅。缺省不归一。 */
  normalize?: number
  /** 软限幅的天花板，dBFS。默认 -0.5。设 false 关闭。 */
  limit?: number | false
}

export type AudioSpec = {
  sampleRate?: number
  clips: AudioClip[]
  buses?: Record<string, AudioBus>
  master?: MasterOptions
}
