# 音频

声音和画面共用一条时间轴。旁白的句子、音乐的段落、底鼓、冲击、扫光这些节点都是 timeline 上的 cue 或段落：画面用 `pulse(f.t, tl.times('kick'))` 读这些时间，音频用 `sfx(src, tl.times('kick'))` 或 `{ type: 'impact', at: tl.times('impact') }` 读同一组时间。cue 写对了，音画就是对齐的。

混音由 [visualtone](https://github.com/ruochi/visualtone)（乐谱格式 v2）完成。`AudioSpec` 是一层薄薄的写法，编译成 visualtone 的乐谱：

```
clips ─┬─▶ 母线 'voice' ─▶ 音轨 voice (role: voice)        ─┐
       ├─▶ 母线 'music' ─▶ 音轨 music (role: music，自动让路) ─┤
       └─▶ 母线 'main'  ─▶ 音轨 main  (role: sfx)          ─┼─▶ visualtone：闪避 → 混响发送 → LUFS 对齐 → 限幅 ─▶ WAV
tracks（visualtone 原生：notes / patterns / chords / sfx）─────┘
时间轴的 bpm、段落 ──▶ 乐谱的 tempo、sections
```

- 每条母线编成一条音轨，片段变成它的 `clips`，采样在内存里交给 visualtone，不经过临时文件；
- 负的 `at` 折算成 `offset`，声像烘进缓冲，`loop` 缺省铺到合成结束；
- 跟电平的闪避交给 visualtone 的 `duck`；压缩和按时间点的闪避在 visualtone 的 `processTrack` 里做；
- 时间轴的 `bpm`、每小节拍数和段落自动带进乐谱，原生音轨可以直接写 `in: ['intro']`、`at: 'drop@2:1'`；
- 同样的输入永远得到同样的输出。

`render` 会把混好的 WAV 编码成 AAC，和视频合进同一个 mp4。`audio` 命令只出声音：WAV、乐谱 JSON、波形图和报告。

## 写在哪里

```ts
defineComposition({
  …,
  timeline: tl,
  envelopes: true,                       // 画面要读电平时才写
  audio: ({ tl, duration }) => ({ clips: […], buses: {…}, tracks: […], key: 'D major', master: {…} }),
})
```

`audio` 可以直接写成对象，也可以写成函数。写成函数时，它在 `setup` 之后才被调用，所以能用上 `setup` 里预计算的数据，比如粒子聚合完成的时刻。

| 字段 | 说明 |
| --- | --- |
| `clips` | 音频文件或程序化音源，见下 |
| `buses` | 母线设置 |
| `tracks` | visualtone 原生音轨 |
| `tempo` | `{ bpm, meter, swing }`。缺省取时间轴的 `bpm` 和每小节拍数 |
| `key` | 调性，`"D major"`、`"Em"`。写了才检查出调 |
| `sections` | `[{ id, at }]`。缺省取时间轴的段落；名字不是字母开头的段落换成 `s0`、`s1`……，只保留边界 |
| `seed` | 随机种子 |
| `master` | 响度、天花板、总线淡入淡出 |

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

音效文件的峰值往往不在开头。whoosh 文件的峰值在 0.45 秒处，想让峰值落在冲击点上，就写 `at: impact - 0.45`。用内置音效时不用算：`at` 本来就是锚点，见下。

```ts
...sfx('../assets/kick.wav', tl.times('kick'), { gain: -5, bus: 'drums' })          // 一个音效放在一组时间点上
...tl.times('type').map((at, i, all) => ({ src: '../assets/tick.wav', at, gain: -14, pan: (i / all.length - 0.5) * 0.8 }))
```

## 母线 `buses`

```ts
buses: {
  voice: { comp: { threshold: -24, ratio: 2.5 } },
  music: { gain: -2, duck: { times: tl.times('kick'), depth: 0.4 } },
}
```

| 字段 | 说明 |
| --- | --- |
| `gain` | dB，写在这条母线的音轨上 |
| `duck` | 闪避，见下 |
| `comp` | 压缩器 `{ threshold, ratio, attack, release }`，缺省 -20 dBFS、3:1、5 ms、120 ms。旁白的峰均比高，压一下峰，限幅器就不用压那么深 |
| `space` | 混响发送 0..1 |
| `role` | `voice` / `music` / `sfx`。缺省按名字猜：`voice`、`vo`、`narration` → voice；`music`、`bgm` → music；其余 → sfx |

`role` 决定闪避：有 voice 母线时，每条 music 母线和 music 音轨都会在旁白开口时自动让路；sfx 不让路。

### 闪避 `duck`

- **`'auto'`**（music 的缺省）：跟着所有 voice 轨的电平压低，同时在 2.5 kHz 一带让出人声，旁白停下就回来。给旁白让路什么都不用写。
- **`'off'`**：不压。
- **`{ by, depth, release }`**：跟着另一条母线或音轨的电平压。贝斯给底鼓让路这么写。
- **`{ times, depth, attack, hold, release }`**：每个时间点把这条母线压下去 `depth`，在 `attack` 内压到底，保持 `hold`，再按 `release` 指数恢复。给底鼓让路的“抽吸感”就是这么来的。用的是画面脉冲同一组时间，所以视觉上的一次跳动，正好对应音乐的一次“吸气”。

`times` 可以和前三种之一写成数组同时用；`'auto'`、`'off'`、`{ by }` 只能写一个。

| 场景 | 写法 |
| --- | --- |
| 旁白压音乐 | 不用写（`'auto'`）。音乐还是太满，就降音乐的 `gain` |
| 贝斯给底鼓让路 | `{ by: 'drums', depth: 0.4, release: 0.12 }` |
| 底鼓抽吸，舞曲感 | `{ times: tl.times('kick'), depth: 0.5–0.7, attack: 0.005–0.01, release: 0.12–0.2 }` |
| 冲击点让路 | `{ times: tl.times('impact'), depth: 0.6–0.8, release: 0.4–0.8 }` |

## visualtone 原生音轨 `tracks`

不用音频文件也能有音乐和音效。`tracks` 里直接写 visualtone 的音轨，写的是编曲，不是一个个音符：

```ts
import type { AudioTrack } from 'motionflexlayer'

const tracks: AudioTrack[] = [
  // 和弦写在段落上，段落来自时间轴（旁白的每一句就是一段）
  { id: 'pad', instrument: 'epiano', gain: -11, space: 0.55,
    chords: [{ in: ['intro'], progression: 'Fmaj7', style: 'pad' }, { in: ['how'], progression: 'Am7 | G', style: 'pad' }] },
  // 贝斯跟着和弦弹根音，每小节一下
  { id: 'bass', instrument: 'sub', gain: -14, follow: 'pad', patterns: [{ grid: '1bar', notes: '1' }] },
  // 鼓用步进串，一个字符一个十六分音符
  { id: 'drums', instrument: 'drums', patterns: [{ in: ['drop'], steps: { kick: 'x...x...x...x...', hat: '..x...x...x...x.' } }] },
  // 音效：at 是锚点
  { id: 'fx', role: 'sfx', sfx: [
    { type: 'whoosh', at: tl.at('how'), size: 0.3, direction: 'in' },
    { type: 'impact', at: tl.times('impact'), size: 0.3 },
  ] },
]
```

- 音轨 id 和母线名共用一个命名空间，`duck.by`、`follow` 可以互相引用；
- `instrument` 是语义名：`epiano`、`piano`、`pad`、`strings`、`bass`、`sub`、`pluck`、`lead`、`bell`、`marimba`、`drums` 等。`gain` 是在乐器自身电平上加减的 dB，0 已经是乐器之间配平好的音量；
- 时间：数字是秒；有 tempo 时可以写 `"5:1"`（第 5 小节第 1 拍）、`"drop@2:3"`（drop 段第 2 小节第 3 拍）。长度写 `"1/8"`、`"1bar"` 或秒；
- 内置音效 14 种：`whoosh`、`riser`、`downlifter`、`swell`、`impact`、`boom`、`hit`、`pop`、`click`、`tick`、`type`、`glitch`、`shimmer`、`chime`。`at` 是这一下“对准”的时刻：whoosh 是最响处，riser 是冲到的那一刻，swell 是最响处，其余是起音。`at` 可以是一组时间；
- 写错的字段会报错，并提示应该写什么（`t` → `at`、`keys` → `epiano`、`swoosh` → `whoosh`）。

完整写法见 visualtone 的 README。

## 总线 `master`

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `lufs` | -16 | 目标积分响度（BS.1770，K 计权）。网络视频 -16 到 -14 |
| `ceiling` | -1 | 限幅器天花板，dBFS |
| `fadeIn` / `fadeOut` | 0 | 秒。全片结尾一般留 0.8–1.5 秒淡出 |

限幅器是保险，不是响度工具：报告里的“限幅”超过 3 dB，说明某处太冲，应该降那里的增益或音效的 `size`。

## 画面读声音：包络

合成写 `envelopes: true` 时，渲染前先混一遍音，算出每条母线和音轨的逐帧电平和起音时刻。帧函数里：

```ts
f.audio!.level('voice')               // 电平，线性振幅，闪避之后；帧间插值。不传参数是总线
f.audio!.db('music')                  // dBFS，静音为 -120
f.audio!.onsets('fx')                 // 起音时刻，喂给 pulse / springSteps
f.audio!.since('fx')                  // 距上一次起音多少秒
f.audio!.at(f.t - k / 30).level('voice')   // 另一时刻的读数，画滚动波形
```

- 电平是 visualtone 给的每条音轨闪避之后、响度对齐之后的振幅，再乘上总线淡入淡出。音乐让路时，读数真的会降下来；
- 起音时刻来自乐谱：音符的开头、内置音效的锚点、片段的开头。相隔不到 30 毫秒的（和弦、扫弦）算一次。

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

[examples/synth](../examples/synth/index.ts) 是一个完整的合成器套件，showreel 的整首配乐就是用它写出来的，作为一个音源放进 visualtone 混音。它只是示例；新片子优先用 visualtone 的原生音轨或真实的音频文件。

## 看不到声音时怎么检查

```bash
npm run mfl -- audio examples/narrated/index.ts
```

输出 `out/narrated/narrated.wav`、`narrated.score.json`（交给 visualtone 的乐谱，片段的 `src` 是键名）、`narrated.waveform.png`，并在终端打印报告：

```
音频 32.59s  响度 -16.0 LUFS  峰值 -1.0 dBFS  RMS -18.8 dBFS  限幅 1.8 dB
  · out-of-key  track lead: 3 notes outside C major …
  段落            RMS    峰值
  intro         -19.4   -1.0   0.00–3.83s
  …
```

逐项检查：

1. **响度。** 接近 `master.lufs`；限幅不超过 3 dB。
2. **visualtone 的检查。** `out-of-key`（出调）、`out-of-range`（超出乐器音区）、`flat-velocity`（手写音符力度都一样）、`dense-sfx`（音效叠在一起）、`sfx-clipped`（音效在 0 秒之前就开始了）、`voice-masked`（旁白说话时音乐在 2.5 kHz 一带太响）、`deep-limiting`。⚠ 是要处理的。
3. **段落起伏。** 纯音乐片的段落 RMS 应该和画面的能量曲线一致：开场安静，主段落最响，结尾回落。
4. **cue 跳变。** 每个 cue 统计前后各 50ms 的 RMS 差。冲击、底鼓这种“画面打一下”的点应该是 +3 dB 以上；接近 0 说明这个点上没有声音进来。旁白登记的 cue 不参与（`audit: false`）。
5. **旁白和音乐的比例。** 有旁白时写 `envelopes: true`，比较旁白说话时 `level('voice')` 和音乐的读数：音乐应低 10 dB 以上。
6. **波形图。** 竖线是段落和 cue，曲线是 RMS 包络。检查包络的突起是否落在 cue 线上，淡出是否平滑地收到底。

## 电平参考

| 内容 | 起点 |
| --- | --- |
| 旁白 | 0 dB，母线 `comp: { threshold: -24, ratio: 2.5 }`。TTS 偏轻时片段加 2–3 dB |
| 音乐铺底（有旁白） | `epiano` / `pad` 音轨 `gain` -15 到 -10，`sub` 贝斯 -18 到 -14；文件 -14 到 -10 dB。自动让路 |
| BGM 循环（无旁白） | -7 dB，被底鼓闪避 0.55 |
| 冲击 | -3 dB，或内置 `impact` / `boom` size 0.25–0.3 |
| whoosh | -6 dB，或内置 `whoosh` size 0.2–0.3 |
| swell、riser | size 0.2–0.3 |
| 打字 tick | -14 dB，声像从左扫到右 |
| master | -16 LUFS，淡出 0.8–1.5 秒 |

visualtone 的音效 `size` 过了 0.4 就比旁白冲得多，有旁白时音效轨整体再降 3–8 dB（音轨的 `gain`）。

经验：

- 有旁白时，旁白是基准，其余都往下摆。音乐在旁白说话时只是背景。
- 音效之间要拉开层级。冲击最响，其次是底鼓和过渡音，细碎的 tick、sparkle 要低 8–12 dB。
- 同一时刻的音效不要超过三个。段落交界处常常同时有新和弦、whoosh 和冲击，挑一个。
- 预备动作配 riser，`at` 写冲击点那一刻。
- 给音效加一点声像，跟着画面里物体的位置走：`pan: (x / W - 0.5) * 0.8`。

## 已知限制

- visualtone v2 的音色控制只有 `brightness` 和 `space`，没有 EQ；母线的压缩器和按时间点的闪避是 motionflexlayer 在 `processTrack` 里做的。
- 片段淡入淡出是线性的。
- 小节记法从 0 秒数起，不认时间轴的 `offset`；音乐有前奏留白时，用段落写时间（`"drop@1:1"`）。
- 解码用 ffmpeg，结果缓存在进程内。很长的音频文件会占较多内存：48kHz 立体声每分钟约 23MB。
- 报告是测量和经验规则，听感的好坏需要人来判断。
