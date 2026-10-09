# motionflexlayer

在 [flexlayer](https://github.com/ruochi/flexlayer) 之上做动画的框架。

一帧画面是时间 `t` 的纯函数，返回一棵 flexlayer 节点树：文字和布局交给 flexlayer 排版，粒子、光效这类图形交给 `draw` 画，动效、时间轴、渲染和音频交给 motionflexlayer。画面和声音共用一条节拍时间轴，所以音画天然对齐。

```ts
import { defineComposition, place, pulse, spring, text, timeline } from 'motionflexlayer'

const tl = timeline({ bpm: 120, duration: 6 }).cue('kick', [0.5, 1, 1.5, 2])

export default defineComposition({
  id: 'demo', width: 1920, height: 1080, fps: 60, duration: 6,
  background: '#0b0d12', color: '#f2efe8', timeline: tl,
  render: (f) => {
    const e = spring(f.t - 0.3)
    const k = pulse(f.t, tl.times('kick'))
    return place({ x: 960, y: 540 + (1 - e) * 60, scale: 1 + 0.04 * k }, text('motion flexlayer', { fontSize: 120, fontWeight: 800 }))
  },
  audio: ({ tl }) => ({ clips: tl.times('kick').map((at) => ({ src: './kick.wav', at })) }),
})
```

## 给模型看的入口

让模型做动画时，先让它读 **[MOTION.md](MOTION.md)**。里面写了标准输入流程、心智模型、硬规则、四步工作流（时间轴 → 帧函数 → 音频 → 验证）、API 速查、动效基本功，以及怎样避免每支片子都一个样。

其余文档：

- [docs/RECIPES.md](docs/RECIPES.md)：动效配方，包括入场、冲击、文字、镜头、计数器、粒子、3D、质感；
- [docs/NARRATION.md](docs/NARRATION.md)：旁白先行。用 TTS 念出文案，按旁白长度排时间轴，字幕和逐词动效从同一份数据来；
- [docs/AUDIO.md](docs/AUDIO.md)：音频交给 visualtone 混音。音轨、母线、人声闪避、响度，以及听不到声音时怎么检查；
- [docs/REACT.md](docs/REACT.md)：React 写法；
- [docs/FLEXLAYER-CHANGES.md](docs/FLEXLAYER-CHANGES.md)：需要 flexlayer 配合的改动。

## 安装

flexlayer 和 visualtone 以 git 依赖的方式固定在具体提交上，`npm i` 时会自动拉取并构建，不需要再把仓库并排放：

```bash
git clone https://github.com/ruochi/motionflexlayer
cd motionflexlayer && npm i
npm run assets          # 生成示例用的音频文件
```

要合成新的旁白，还需要 Python 3 和 edge-tts（需要联网）：

```bash
pip install edge-tts     # 解释器不是 python3 时，用环境变量 MFL_PYTHON 指定
```

旁白音频会缓存在仓库里（例如 `examples/narrated/voice/`），文案和音色没变就不会重新合成。离线环境设 `MFL_TTS_OFFLINE=1`：缓存缺失时直接报错，而不是去联网。

需要 ffmpeg。程序按以下顺序查找：

1. 环境变量 `MFL_FFMPEG` 或 `FFMPEG_PATH`；
2. 可选依赖 `ffmpeg-static`；
3. `PATH` 里的 `ffmpeg`。

用 React 写法时，再装 `react@^19.3` 和 `react-reconciler@^0.34`。

## 命令

```bash
npm run mfl -- stills examples/hello/index.ts            # 均匀取 12 帧，生成联系表
npm run mfl -- stills examples/hello/index.ts 2.1 4.05   # 指定时刻
npm run mfl -- check  examples/hello/index.ts            # 逐帧排版检查，汇总问题
npm run mfl -- audio  examples/hello/index.ts            # WAV、波形图、电平报告
npm run mfl -- render examples/hello/index.ts            # 多进程渲染 mp4，带音轨
npm run mfl -- render examples/hello/index.ts --scale 0.5 --fps 30 --from 2 --to 6   # 草稿
npm run mfl -- cues   examples/hello/index.ts            # 导出时间轴 JSON
npm run voice -- examples/narrated/index.ts              # 合成或读取旁白，按段列出时间和语速
```

输出在 `out/<id>/` 下。

## 示例

| 示例 | 内容 |
| --- | --- |
| [examples/hello](examples/hello/index.ts) | 10 秒，核心写法的最小完整示例：逐字弹簧标题、蒙版擦除、节拍计数器、打字机、冲击震屏，配 BGM 和音效 |
| [examples/hello-react](examples/hello-react/index.tsx) | 6 秒，React 写法：柱状图逐根长出、数字滚动、状态标签 |
| [examples/showreel](examples/showreel/index.ts) | 48 秒、六段的参考片：几何、粒子、版式、3D 点云、落款。整首配乐用代码合成 |
| [examples/narrated](examples/narrated/index.ts) | 约 33 秒的中文旁白片：时间轴由旁白长度决定，逐词字幕、人声波形、音乐给人声让频段、排版检查演示 |
| [examples/ink](examples/ink/index.ts) | 72 秒、九个镜头的旁白片「着墨」：书法字一笔笔写出后落进段落里自己的格子，拖动栏宽逐帧重排再改竖排，三个字合成一圈墨迹描边，玻璃折射，挤出的立体字，镜头推向排版算出的一点，按着墨对齐。每个镜头都是网页或手写 canvas 要多费不少力气的事 |
| [examples/synth](examples/synth/index.ts) | 程序化合成器套件，showreel 的配乐用的就是它 |

## 目录

```
src/
  math.ts ease.ts motion.ts random.ts color.ts   时间、缓动、弹簧、噪声、颜色
  timeline.ts                                   节拍、段落、cue
  composition.ts                                defineComposition、帧、加载
  nodes.ts drawkit.ts canvas.ts                 动效原语（镜头参数 shot、滚动、擦除、打字）、draw 工具
  render/                                       静帧、联系表、多进程视频、问题汇总
  audio/                                        AudioSpec 编译成 visualtone 乐谱、混音、包络、WAV、报告、波形
  voice/                                        TTS（edge-tts）、缓存、旁白时间轴、逐词对齐
  react/                                        React 适配
  cli.ts
```

## 现状

- 版本 0.2，接口可能还会变。对 0.1 的写法，主要变化是定位从 `cx`、`cy` 改成 `x`、`y`、`anchor`（flexlayer 0.2 的要求），母线输出改成 `master: { lufs, ceiling }`。
- 核心写法和 React 写法可用；Vue 计划放在 v2，设计见 [REACT.md](docs/REACT.md#vuev2-计划)。
- 视频帧走 flexlayer 的 `renderFrames` 原始 RGBA 输出，0.1 的 PNG 跳过垫片已删除。
- 混音交给 visualtone：响度归一、限幅、人声闪避和分析报告都来自它。设了 `envelopes: true` 的合成，帧函数可以通过 `f.audio` 读到各音轨的电平和起音。
- 依赖 flexlayer 0.2.30：镜头用 `view` 取景，`shot()` 算参数，结构由调用方写两层 layer；字号按屏幕上的大小和短边检查，示例都不再整类忽略问题码。还需要 flexlayer 配合的改动见 [FLEXLAYER-CHANGES.md](docs/FLEXLAYER-CHANGES.md)，例如离屏画布按可见区域裁剪、被取景窗裁开的文字怎么报 `outside-safe`。
- 音频是按响度报告、频段分析和波形检查的，没有人工试听过。
