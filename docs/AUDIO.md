# 音频

声音和画面共用一条时间轴。旁白的句子、音乐的段落、底鼓、冲击、扫光这些节点都是 timeline 上的 cue 或段落：画面用 `pulse(f.t, tl.times('kick'))` 读这些时间，音频用 `sfx(src, tl.times('kick'))` 读同一组时间。cue 写对了，音画就是对齐的。

混音由 [visualtone](https://github.com/ruochi/visualtone) 完成。`AudioSpec` 是一层薄薄的写法，编译成 visualtone 的乐谱：

```
clips ─┬─▶ 母线 'voice' ─▶ 音轨 voice (role: voice)  ─┐
       ├─▶ 母线 'music' ─▶ 音轨 music (duck by voice) ─┤
       └─▶ 母线 'main'  ─▶ 音轨 main                  ─┼─▶ visualtone：混响/延迟总线 → 均衡/压缩 → LUFS 对齐 → 限幅 ─▶ WAV
tracks（visualtone 原生：音符、内置音效）──────────────┘
```

- 每条母线编成一条立体声音轨，片段变成它的 `clips`；
- 片段的声像、循环预先烘进缓冲，dB 增益换成线性；
- 按时间的闪避编成 `automation.gain` 关键帧，按电平的闪避交给 visualtone 的 `duck`；
- 同样的输入永远得到同样的输出。

`render` 会把混好的 WAV 编码成 AAC，和视频合进同一个 mp4。`audio` 命令只出声音：WAV、乐谱 JSON、波形图和报告。

## 写在哪里

```ts
defineComposition({
  …,
  timeline: tl,
  envelopes: true,                       // 画面要读电平时才写
  audio: ({ tl, duration }) => ({ clips: […], buses: {…}, tracks: […], master: {…} }),
})
```

`audio` 可以直接写成对象，也可以写成函数。写成函数时，它在 `setup` 之后才被调用，所以能用上 `setup` 里预计算的数据，比如粒子聚合完成的时刻。

## 片段 `AudioClip`

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `src` | — | 文件路径（相对合成文件所在目录，任何 ffmpeg 能读的格式），或 `{ render(ctx) → { l, r } }` |
| `at` | 0 | 放在时间轴的第几秒。可以是负数：从音源中间开始播 |
| `offset` | 0 | 从音源的第几秒开始取 |
| `duration` | 到音源结束 | 取多长；`loop` 时缺省铺到合成结束 |
| `loop` | false | 循环。8 秒的 BGM 小样铺满全片用这个 |
| `gain` | 0 | dB |
| `pan` | 0 | -1 左 … 1 右，等功率声像 |
| `fadeIn` / `fadeOut` | 0 | 秒，线性 |
| `bus` | `'main'` | 进哪条母线 |

whoosh 的峰值在文件的 0.45 秒处，想让峰值落在冲击点上，就写 `at: impact - 0.45`。更清楚的写法是在时间轴上单独建一个 cue：`tl.cue('whoosh', tl.bar(2) - 0.45)`。

```ts
...sfx('../assets/kick.wav', tl.times('kick'), { gain: -5, bus: 'drums' })          // 一个音效放在一组时间点上
...tl.times('type').map((at, i, all) => ({ src: '../assets/tick.wav', at, gain: -14, pan: (i / all.length - 0.5) * 0.8 }))
```

## 母线 `buses`

```ts
buses: {
  voice: { comp: { threshold: -24, ratio: 2.5, attackMs: 8, releaseMs: 120, knee: 6, makeup: 0 } },
  music: { gain: -2, duck: [{ by: 'voice', depth: 0.6, band: [1000, 4000] }, { times: tl.times('kick'), depth: 0.4 }] },
}
```

| 字段 | 说明 |
| --- | --- |
| `gain` | dB，加到这条母线的每个片段上 |
| `duck` | 闪避，见下 |
| `role` | `voice` / `music` / `sfx`，分析时归类用。缺省按名字猜：`voice`、`vo`、`narration` → voice；`music`、`bgm` → music；`sfx`、`fx` → sfx |
| `eq` / `comp` | visualtone 的均衡和压缩，写法见 visualtone 的 README |
| `space` / `room` / `echo` | 混响、房间、延迟的发送量 0..1 |

### 闪避 `duck`

- **按电平：** `by: '另一条母线或音轨'`。那条轨响起来时压低本母线 `depth`。`hold` 是声音停了以后再压住多久（默认 0.25 秒，免得旁白字间一松一紧），`release` 是恢复时间。写了 `band: [1000, 4000]` 时只压这个频段，其余频段原样保留，给旁白让路首选这种。一条母线只能有一个 `by`。
- **按时间：** `times`。每个时间点把这条母线压下去 `depth`，在 `attack` 内压到底，保持 `hold`，再按 `release` 指数恢复。给底鼓让路的“抽吸感”就是这么来的。用的是画面脉冲同一组时间，所以视觉上的一次跳动，正好对应音乐的一次“吸气”。

两种可以同时用，写成数组。

| 场景 | 写法 |
| --- | --- |
| 旁白压音乐 | `{ by: 'voice', depth: 0.5–0.75, band: [1000, 4000] }` |
| 旁白压音乐，音乐很满 | 再加一条整体的：先降音乐的 `gain`，再用 band 闪避 |
| 底鼓抽吸，舞曲感 | `{ times: tl.times('kick'), depth: 0.5–0.7, attack: 0.005–0.01, release: 0.12–0.2 }` |
| 冲击点让路 | `{ times: tl.times('impact'), depth: 0.6–0.8, release: 0.4–0.8 }` |

## visualtone 原生音轨 `tracks`

不用音频文件也能有音乐和音效。`tracks` 里直接写 visualtone 的音轨：

```ts
import { chord } from 'visualtone'

tracks: [
  {
    id: 'pad', role: 'music', engine: 'epiano', hue: 210, lightness: 0.42, space: 0.55,
    notes: chord('Fmaj7', 'F4').map((y) => ({ t: tl.at('intro'), y, size: 0.1, duration: 3, ease: 'exp' })),
    duck: { by: 'voice', amount: 0.75, band: [1000, 4000] },
  },
  {
    id: 'fx', role: 'sfx',
    sfx: [
      { sfx: 'whoosh', t: tl.at('how') - 0.2, size: 0.3, direction: 0.6 },
      { sfx: 'impact', t: tl.at('outro'), size: 0.45, low: 0.6 },
    ],
  },
]
```

- 音轨 id 和母线名共用一个命名空间，`duck.by` 可以互相引用；
- 没写 `channel` 时框架补成立体声 `[0, 1]`（visualtone 自己的缺省是单声道）；
- 内置音效：`whoosh`、`riser`、`swell`、`impact`、`pop`、`tick`、`key`、`shimmer`。它们在 visualtone 里按事件展开成 `fx:whoosh-1` 这样的音轨，包络里另有按前缀合并的 `fx`；
- 用小节记法（`at: "4:2"`、`len: "1/8"`、`pitch: "A3"`）时，在 AudioSpec 上写 `bpm`；
- 音色：`hue` 决定音色家族，`lightness` 决定明暗，`engine` 可选 `wavetable`、`pluck`、`marimba`、`epiano`。完整字段见 visualtone 的 README。

## 总线 `master`

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `lufs` | -16 | 目标积分响度（BS.1770）。网络视频 -16 到 -14 |
| `ceiling` | -1 | 限幅器天花板，dBFS |
| `drive` | 0 | 总线饱和。有旁白时保持 0 |
| `fadeIn` / `fadeOut` | 0 | 秒。全片结尾一般留 0.8–1.5 秒淡出 |
| `reverb` / `room` / `delay` / `eq` / `comp` | — | visualtone 的总线效果 |

限幅器是保险，不是响度工具：报告里的“限幅”超过 3 dB，说明某处太冲，应该降那里的片段增益。

## 画面读声音：包络

合成写 `envelopes: true` 时，渲染前先混一遍音，算出每条母线和音轨的逐帧电平和起音时刻。帧函数里：

```ts
f.audio!.level('voice')               // RMS 电平，线性，帧间插值；不传参数是总线
f.audio!.db('music')                  // dBFS，静音为 -120
f.audio!.onsets('fx')                 // 起音时刻，喂给 pulse / springSteps
f.audio!.since('fx')                  // 距上一次起音多少秒
f.audio!.at(f.t - k / 30).level('voice')   // 另一时刻的读数，画滚动波形
```

多进程渲染时，主进程混音一次，把包络写成 JSON 发给每个 worker，worker 不再混音。

能用时间轴解决的就别用包络：音效落在 cue 上，画面直接读同一个 cue 更准。包络适合“声音本身的形状”：旁白的起伏、音乐的能量、电平表。

## 程序化音源

不想用音频文件、也不想写 visualtone 音轨时，`src` 可以是一个生成采样的函数：

```ts
const tone: AudioSource = {
  name: 'sine-440',
  render: ({ sampleRate, length }) => {
    const l = new Float32Array(length)
    for (let n = 0; n < length; n++) l[n] = 0.2 * Math.sin((2 * Math.PI * 440 * n) / sampleRate)
    return { l, r: l.slice() }
  },
}
```

新片子优先用 visualtone 的原生音轨或真实的音频文件。着墨的配乐写在 `examples/ink/sound.ts`，是 visualtone 音轨，和弦按旁白的段落换。

## 看不到声音时怎么检查

```bash
npm run mfl -- audio examples/ink/index.ts
```

输出 `out/ink/ink.wav`、`ink.score.json`（交给 visualtone 的乐谱）、`ink.waveform.png`，并在终端打印报告。下面这组数字是报告长什么样，不是着墨的实测：

```
音频 32.59s  响度 -16.0 LUFS  峰值 -1.6 dBFS  RMS -19.2 dBFS  限幅 1.6 dB
  旁白：1–4 kHz 高出音乐 19.5 dB  音效 2.8 个/10s  最短间隔 0.03s
  · voice 合计占能量 73%，盖过了 fx:shimmer 6%、pad 5%  → …
  段落            RMS    峰值
  intro         -17.4   -4.9   0.00–3.83s
  …
```

逐项检查：

1. **响度。** 接近 `master.lufs`；限幅不超过 3 dB。
2. **旁白。** 有旁白时报告按 visualtone 的 voiceover-bed 档案分析：旁白在 1–4 kHz 至少高出音乐 6 dB；音效别太密。
3. **诊断。** ⚠ 是要处理的，· 是参考。建议里的 `size`、`eq.peaks` 等字段是 visualtone 音轨的写法，对母线就改片段的 `gain` 或母线的 `eq`。有旁白时，“旁白占能量大头”是正常的。
4. **段落起伏。** 纯音乐片的段落 RMS 应该和画面的能量曲线一致：开场安静，主段落最响，结尾回落。
5. **cue 跳变。** 每个 cue 统计前后各 50ms 的 RMS 差。冲击、底鼓这种“画面打一下”的点应该是 +3 dB 以上；接近 0 说明这个点上没有声音进来。旁白登记的 cue 不参与（`audit: false`）。
6. **波形图。** 竖线是段落和 cue，曲线是 RMS 包络。检查包络的突起是否落在 cue 线上，淡出是否平滑地收到底。

## 电平参考

| 内容 | 起点 |
| --- | --- |
| 旁白 | 0 dB，母线加轻压缩（ratio 2–3） |
| 音乐铺底（有旁白） | visualtone 音轨 `size` 0.07–0.1；文件 -14 到 -10 dB；`duck` by voice，band 1–4 kHz |
| BGM 循环（无旁白） | -7 dB，被底鼓闪避 0.55 |
| 冲击 | -3 dB，或内置 `impact` size 0.4–0.5 |
| whoosh | -6 dB，或内置 `whoosh` size 0.3 |
| 打字 tick | -14 dB，声像从左扫到右 |
| master | -16 LUFS，淡出 0.8–1.5 秒 |

经验：

- 有旁白时，旁白是基准，其余都往下摆。音乐在旁白说话时只是背景。
- 音效之间要拉开层级。冲击最响，其次是底鼓和过渡音，细碎的 tick、sparkle 要低 8–12 dB。
- 同一时刻的音效不要超过三个。冲击点上已经有 impact 和 kick 时，就不要再叠 whoosh 的尾巴。
- 预备动作配 riser，让它在冲击点那一刻结束，而不是在冲击点之后才停。
- 给音效加一点声像，跟着画面里物体的位置走：`pan: (x / W - 0.5) * 0.8`。

## 已知限制

- 按电平闪避只有 `by`、`depth`、`hold`、`release`、`band`；起压时间由 visualtone 固定。
- 片段淡入淡出是线性的。
- 解码用 ffmpeg，结果缓存在进程内。很长的音频文件会占较多内存：48kHz 立体声每分钟约 23MB。
- 报告是测量和经验规则，听感的好坏需要人来判断。
