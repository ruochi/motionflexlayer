# 音频

声音和画面共用一条时间轴。音乐、底鼓、冲击、扫光这些节点写成 timeline 上的 cue，画面用 `pulse(f.t, tl.times('kick'))` 读这些时间，音频用 `sfx(src, tl.times('kick'))` 读同一组时间。所以只要 cue 写对，音画就是对齐的，不需要再手动调整偏移。

```
clips ─┬─▶ bus 'main'  ──┐
       ├─▶ bus 'music' ──┼─▶ master（增益 → 淡入淡出 → 归一 → 软限幅）─▶ 16-bit WAV
       └─▶ bus 'drums' ──┘
```

`render` 会把混好的 WAV 编码成 AAC，和视频合进同一个 mp4。`audio` 命令只出声音：生成 WAV、波形图和电平报告。

## 写在哪里

```ts
defineComposition({
  …,
  timeline: tl,
  audio: ({ tl, duration }) => ({ clips: […], buses: {…}, master: {…} }),
})
```

`audio` 可以直接写成对象，也可以写成函数。写成函数时，它在 `setup` 之后才被调用，所以能用上 `setup` 里预计算的数据，比如粒子聚合完成的时刻。

## 片段 `AudioClip`

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `src` | — | 文件路径（相对合成文件所在目录，任何 ffmpeg 能读的格式），或 `{ render(ctx) → { l, r } }` |
| `at` | 0 | 放在时间轴的第几秒 |
| `offset` | 0 | 从音源的第几秒开始取 |
| `duration` | 到音源结束 | 取多长；`loop` 时缺省铺到合成结束 |
| `loop` | false | 循环。8 秒的 BGM 小样铺满全片用这个 |
| `gain` | 0 | dB |
| `pan` | 0 | -1 左 … 1 右，等功率声像 |
| `fadeIn` / `fadeOut` | 0 | 秒，正弦曲线 |
| `bus` | `'main'` | 进哪条母线 |
| `label` | — | 只用于报告 |

`at` 可以是负数：音源从中间开始播。比如 whoosh 的峰值在文件的 0.45 秒处，想让峰值落在冲击点上，就写 `at: impact - 0.45`。更清楚的写法是在时间轴上单独建一个 cue：`tl.cue('whoosh', tl.bar(2) - 0.45)`。

**一个音效放在一组时间点上：**

```ts
...sfx('../assets/kick.wav', tl.times('kick'), { gain: -5, bus: 'drums' })
```

**每个点的参数不同时，直接用 map：**

```ts
...tl.times('type').map((at, i, all) => ({ src: '../assets/tick.wav', at, gain: -14, pan: (i / all.length - 0.5) * 0.8 }))
```

## 母线 `buses`

```ts
buses: {
  music: { gain: -2, duck: { times: tl.times('kick'), depth: 0.55, release: 0.16 } },
  voice: {},
  bed: { duck: { by: 'voice', depth: 0.6, threshold: -32, release: 0.4 } },
}
```

`duck`（闪避）有两种：

- **按时间：** `times`。每个时间点把这条母线的音量压下去 `depth`，在 `attack` 时间内压到底，保持 `hold`，再按 `release` 指数恢复。给底鼓让路的“抽吸感”就是这么来的。用的是画面脉冲同一组时间，所以视觉上的一次跳动，正好对应音乐的一次“吸气”。
- **按电平：** `by: '另一条母线'`。跟踪那条母线的包络（上升用 `attack`，下降用 `release`）。电平超过 `threshold` 后开始压低本母线，超出 12 dB 时压满 `depth`，中间线性过渡。人声或旁白压背景音乐用这种。

两种可以同时用，写成数组：`duck: [{ times }, { by: 'voice' }]`。

参数参考：

| 场景 | `depth` | `attack` | `release` |
| --- | --- | --- | --- |
| 底鼓抽吸，舞曲感 | 0.5–0.7 | 0.005–0.01 | 0.12–0.2 |
| 冲击点让路 | 0.6–0.8 | 0.005 | 0.4–0.8 |
| 旁白压音乐 | 0.5–0.7 | 0.03–0.08 | 0.3–0.6 |

## 母线总出 `master`

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `gain` | 0 | dB |
| `fadeIn` / `fadeOut` | 0 | 秒。全片结尾一般留 1–1.5 秒淡出 |
| `normalize` | 不归一 | 先把峰值拉到这个 dBFS（例如 -1），再进限幅 |
| `limit` | -0.5 | 软限幅的天花板，dBFS；`false` 关闭 |

软限幅的工作方式：天花板 85% 以下的信号原样通过，以上的部分用 tanh 圆滑地压进天花板。它是保险，不是响度工具：报告里的“限幅”比例超过 1%，说明整体太响，应该降片段或母线的增益，而不是指望限幅器去压。

## 程序化音源

不想用音频文件时，`src` 也可以是一个生成采样的函数：

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

[examples/synth](../examples/synth/index.ts) 是一个完整的合成器套件：底鼓、拍手、踩镲、贝斯、铺底、supersaw、各类冲击和过渡音效，带混响、乒乓延迟和内部闪避。showreel 的整首配乐就是用它在代码里“写”出来的，见 [examples/showreel/audio.ts](../examples/showreel/audio.ts)。它只是示例，不是框架的一部分；正式项目更常见的做法是用真实的音频文件。

## 看不到声音时怎么检查

模型听不到声音，所以要靠报告和波形图来“看”。运行：

```bash
npm run mfl -- audio examples/showreel/index.ts
```

输出 `out/showreel/showreel.wav`、`showreel.waveform.png`，并在终端打印报告：

```
音频 48.00s  峰值 -0.8 dBFS  RMS -12.7 dBFS  限幅 0.30%
  段落            RMS    峰值
  起笔            -22.7   -7.7   0.00–8.00s
  几何            -12.4   -1.3   8.00–16.00s
  …
  每秒 RMS：-49 -33 -24 -22 -20 -22 -21 -20 -10 -13 …
  cue 跳变（dB，>3 说明这个点上有明显的声音进来）：
    8.00s kick         +14
    8.00s impact       +14
```

逐项检查：

1. **整体电平。** 峰值在 -1 到 -0.3 dBFS 之间；RMS 在 -16 到 -10 dBFS 之间，适合网络视频。RMS 低于 -20 dBFS 就太小声了。
2. **限幅比例。** 低于 1%。超过就降增益。
3. **段落起伏。** 段落 RMS 应该和画面的能量曲线一致：开场安静，主段落最响，结尾回落。如果所有段落都差不多响，说明编排缺少动态。
4. **cue 跳变。** 每个 cue 统计前后各 50ms 的 RMS 差。冲击、底鼓这种“画面打一下”的点应该是 +3 dB 以上；接近 0 说明这个点上没有声音进来，可能漏放了音效，或者被别的声音盖住了。报告会单独列出这些点。
5. **波形图。** 用读图工具打开 `*.waveform.png`：竖线是段落和 cue，曲线是 RMS 包络。检查包络的突起是否落在 cue 线上，淡出是否平滑地收到底。

## 电平参考

以下是 hello 示例的实际取值，可以作为起点：

| 内容 | 片段增益 |
| --- | --- |
| BGM 循环 | -7 dB，进 `music` 母线，被底鼓闪避 0.55 |
| 底鼓 | -5 dB |
| 冲击 | -3 dB |
| whoosh | -6 dB |
| 打字 tick | -14 dB，声像从左扫到右 |
| 结尾 chime | -4 dB |
| master | 淡出 1.5 秒，限幅 -0.8 dBFS |

经验：

- 音效之间要拉开层级。冲击最响，其次是底鼓和过渡音，细碎的 tick、sparkle 要低 8–12 dB。
- 同一时刻的音效不要超过三个。冲击点上已经有 impact 和 kick 时，就不要再叠 whoosh 的尾巴。
- 预备动作配 riser 或倒放镲片，让它在冲击点那一刻结束，而不是在冲击点之后才停。
- 给音效加一点声像，跟着画面里物体的位置走：`pan: (x / W - 0.5) * 0.8`。

## 已知限制

- 只有 dB 增益、声像、淡入淡出、闪避和限幅，没有 EQ、压缩、混响这类效果器。需要的话，在程序化音源里自己处理（参考 synth 示例的 `Biquad` 和混响），或者事先用外部工具处理好音频文件。
- 解码用 ffmpeg，结果缓存在进程内。很长的音频文件会占较多内存：48kHz 立体声每分钟约 23MB。
- 报告只是电平统计，听感的好坏需要人来判断。
