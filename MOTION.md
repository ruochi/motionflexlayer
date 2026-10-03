# Motion Flex Layer：给模型的动画入口

本文是给模型的入口。照着这里的四步做，产出一支带音乐和音效的视频。

- **标签和属性：** flexlayer 的 [SPEC.md](https://github.com/ruochi/flexlayer/blob/main/SPEC.md)。静态写法的规则见 flexlayer 的 [AGENTS.md](https://github.com/ruochi/flexlayer/blob/main/AGENTS.md)，它们在这里同样适用。
- **动效手法：** [docs/RECIPES.md](docs/RECIPES.md)。
- **音频：** [docs/AUDIO.md](docs/AUDIO.md)。
- **React 写法：** [docs/REACT.md](docs/REACT.md)。

## 1. 心智模型

一支视频就是一个**纯函数**：`t（秒）→ 一帧 flexlayer 文档`。没有“上一帧”，没有状态。

```text
时间轴（节拍、段落、cue）
   ├── 帧函数：render(f) → layer 树      画面
   └── 音频：clips 放在同样的 cue 上      声音
           ↓
   stills / check / audio 报告            验证
           ↓
   render：N 个进程 → ffmpeg → mp4
```

| 层 | 用什么 | 负责 |
| --- | --- | --- |
| 结构 | `layer`、HTML 文字、`div` 的 flex，以及 `place` / `camera` / `roll` / `reveal` / `typewriter` | 有哪些东西、在哪、什么时候出现、怎么排 |
| 像素 | `draw` 回调：`fx()` 或任意自定义标签 | 笔触、粒子、光效、数据图、3D 点云 |
| 时间 | `timeline()`、`progress` / `fade` / `spring` / `pulse` / `stagger` | 一切数值随 t 变化 |
| 声音 | `audio.clips`、`buses`、`duck` | 文件或合成器放到 cue 上，混音 |

## 2. 硬性约定

| 规则 | 错误写法 | 正确写法 | 不遵守会怎样 |
| --- | --- | --- | --- |
| 时间一律用秒，动画只依赖 `f.t` | `x = frame * 4`、按帧号写 if | `x = tween(f.t, 1, 1.6, 0, 400, 'outCubic')` | 改了 fps，动画就变速 |
| 帧函数必须是纯函数 | `Math.random()`、`Date.now()`、在 render 里改模块变量、`pos += vel` | `rng(seed)`、`hash(i, seed)`、解析式，或预计算的表 | 多进程乱序渲染，画面会抖动、闪烁 |
| 重计算放进 `setup` | 每帧跑一次粒子模拟、采样文字 | `setup` 里按固定频率模拟，帧函数里查表插值 | 每帧慢几百毫秒 |
| 所有时间点都来自时间轴 | 画面写 `4.0`，音效写 `4.02` | `tl.cue('impact', tl.bar(2))`，两边都读 `tl.times('impact')` | 声音和画面对不上 |
| 嵌套 `layer` 只定位，不排版 | 一个 `layer` 里并排放两段文字 | `place({…}, box({ display: 'flex', gap: 12 }, a, b))` | 文字叠在一起，报 `text-overlap` |
| 嵌套 `layer` 不填背景 | `h('layer', { background: '#fff' })` | 用 `rect`、HTML `background` 或 `draw` | `invalid-attr` |
| 镜头里不放 `blur` / `mask` / `grade` / `glass` | `camera({ zoom: 16 }, reveal(…))` | 带这些效果的元素放到镜头外，或者在 zoom 不大的时候用 | 离屏画布按放大后的尺寸分配，单帧可能慢到几百毫秒 |
| 动画文字不换行 | 让 `p` 自动折行 | `text()` 默认 `white-space:nowrap` | 字距、字号变化时整段重排，画面跳动 |
| 逐字动画放在 `draw` 里 | 给 `span` 写 `transform` | `drawGlyphs(ctx, str, { each })` | `span` 不支持变换，属性被忽略 |
| `draw` 里不重置变换 | `ctx.setTransform(1, 0, 0, 1, 0, 0)`、`ctx.reset()` | 用 `ctx.save()` / `translate` / `restore()` | 破坏 flexlayer 的定位和 `scale` 倍率，导出半分辨率时位置错乱 |
| `draw` 里不分配大对象 | 每帧 `createCanvas(1920, 1080)` | 在模块顶层或 `setup` 里建好，复用 | 内存上涨，越来越慢 |
| 看不见的元素就不输出 | 透明度为 0 的层仍然放进文档 | `place()` 在透明度约为 0 时返回 `null`；条件渲染写 `cond && node` | 白白排版、绘制 |
| React 里每帧都是新挂载 | 用 `useState` / `useEffect` 存动画状态 | 只用 `useFrame()` 和纯计算，`useMemo` 只做帧内去重 | 状态每帧丢失 |
| 音量看报告，不靠猜 | 直接把增益都设成 0 dB | 跑 `audio` 命令，限幅比例低于 1%，各段 RMS 有起伏 | 削波，或者全片一样响 |

## 3. 四步工作流

### 第一步：时间轴

先定节奏，再定画面。BPM 决定一切时间点：120 BPM 时一拍 0.5 秒、一小节 2 秒，4 小节（8 秒）一段。

```ts
import { timeline } from 'motionflexlayer'

const tl = timeline({ bpm: 120, duration: 24 })
  .section('intro', 0)
  .section('drop', 8)
  .section('outro', 20)
tl.cue('kick', tl.beats(16, 40))          // 第 16 到 39 拍，每拍一个底鼓（8–20 秒）
  .cue('impact', [tl.bar(4)])             // 第 4 小节开头，8 秒
  .cue('whoosh', [tl.bar(4) - 0.45])      // 冲击前 0.45 秒起风声，峰值落在冲击上
  .cue('title', [tl.bar(1)])
```

先写下来再动手：每一段要表达什么、观众的视线落在哪、几个 cue 撑起这一段。一段里只要一个重点，其余都是铺垫和余韵。

### 第二步：帧函数

```ts
import { defineComposition, camera, place, text, fx, progress, spring, pulse, wiggle } from 'motionflexlayer'

export default defineComposition({
  width: 1920, height: 1080, fps: 60, duration: 24,
  background: '#07080d', color: '#f4f1ea',
  timeline: tl,
  setup: async () => { /* 预计算 */ },
  render: (f) => {
    const hit = pulse(f.t, tl.times('impact'), 6)       // 冲击包络：1 → 0
    return [
      camera({ width: 1920, height: 1080, zoom: 1 + 0.05 * hit, shakeX: wiggle(f.t, 18, 12 * hit, 1) },
        fx({ width: 1920, height: 1080 }, (ctx) => { /* 背景、粒子 */ }),
        place({ x: 960, y: 540 - (1 - spring(f.t - tl.at('title'))) * 80, opacity: progress(f.t, 2, 2.3) },
          text('标题', { fontSize: 120, fontWeight: 800 })),
      ),
      // HUD 放在镜头外，不跟着震
    ]
  },
})
```

- `render` 返回内容就行，根 `layer`（尺寸、底色）由框架生成；
- 返回数组里可以有 `null` / `false`；
- 结构用节点原语，像素用 `fx` 的 `draw`。

### 第三步：音频

```ts
audio: ({ tl }) => ({
  clips: [
    { src: 'music/bed.wav', loop: true, gain: -8, fadeIn: 1, bus: 'music' },
    ...sfx('sfx/kick.wav', tl.times('kick'), { gain: -5 }),
    ...sfx('sfx/impact.wav', tl.times('impact'), { gain: -3 }),
  ],
  buses: { music: { duck: { times: tl.times('kick'), depth: 0.5 } } },   // 音乐给底鼓让路
  master: { fadeOut: 1.5, limit: -0.8 },
})
```

文件路径相对于合成入口所在的目录。音源也可以是函数，例如程序化合成器，见 [docs/AUDIO.md](docs/AUDIO.md)。

### 第四步：验证，由轻到重

```bash
npm run mfl -- stills comp.ts --cues          # 均匀取 12 帧，加上每段开头，拼成联系表
npm run mfl -- stills comp.ts 3.9 4.0 4.1     # 关键时刻前后各一帧
npm run mfl -- check comp.ts                  # 每 6 帧检查一次排版问题，只出报告
npm run mfl -- audio comp.ts                  # 混音 + 电平报告 + 波形图
npm run mfl -- render comp.ts --scale 0.5 --fps 30   # 草稿视频
npm run mfl -- render comp.ts                 # 成片
```

逐项检查：

1. **联系表（`out/<id>/stills/sheet.png`）：** 每格都有明确的视觉重心；入场前和退场后的格子是空的、干净的；没有元素卡在画布边缘。
2. **关键时刻：** 每个 cue 的前一帧（蓄势）、当帧（命中）、后 0.1 秒（余韵）各看一张，确认命中的那一帧确实最强。
3. **`check`：** 没有 error。warn 逐条判断，对照第 5 节的表。
4. **`audio`：**
   - 限幅比例低于 1%；
   - 各段 RMS 有起伏，高潮比开场响 6–10 dB；
   - 每个重要 cue 的“跳变”大于 3 dB，说明这个点上确实有声音进来；
   - 打开波形图看包络，确认它和画面节奏一致。
5. **成片：** 用 ffmpeg 抽几帧，和 stills 对比，确认多进程渲染的结果和单帧一致。

模型听不到声音，所以音频的“好听”只能靠结构来保证：

- 节拍对齐：音效都放在 cue 上；
- 层次：鼓、音乐、音效分开母线，音乐给底鼓让路；
- 动态：各段电平有起伏；
- 最后在总结里如实告诉用户，这一点你没法亲耳确认。

## 4. API 速查

**时间与缓动：**

- `progress(t, from, to, ease?)`：返回 0..1 的进度。
- `tween(t, from, to, a, b, ease?)`：在 a 和 b 之间插值。
- `fade(t, from, to, fadeIn, fadeOut)`：出现窗口，窗口外为 0。
- `spring(t, { damping, stiffness, mass, velocity })`：按秒计时的弹簧，会过冲。
- `springDuration(config)`：弹簧停稳需要的时间。
- `stagger(i, n, { each, from: 'center', ease })`：第 i 个元素的延迟。
- `keyframes(t, [{ at, value, ease }])`：关键帧插值。
- `wiggle(t, freq, amp, seed)`：平滑随机晃动。
- `oscillate(t, period)`：正弦往复。
- `ease.*`：`outCubic`、`inOutExpo`、`outBack`、`smooth`、`emphasized` 等，另有 `cubicBezier(…)` 和 `steps(n)`。

**事件：**

- `pulse(t, times, decay)`：最近一次事件的衰减包络，节拍闪动、冲击都用它。
- `since(t, times)`：距离上一次事件过去了几秒。
- `count(t, times)`：截至 t 发生了几次。
- `springSteps(t, times, config)`：每次事件弹一格，滚动计数器、轮播用它。

**时间轴：**

- 创建：`timeline({ bpm, beatsPerBar, offset, duration })`。
- 拍和小节换算成秒：`.beat(n)`、`.bar(n, beat)`、`.beats(from, to, step)`、`.grid(fromSec, toSec, step)`。
- 秒换算成拍：`.beatAt(t)`、`.snap(t, division)`。
- 登记：`.cue(name, t | t[], data)`、`.section(name, from, data)`。
- 读取：`.times(name)`、`.at(name)`、`.cues(name)`、`.last(name, t)`、`.sectionAt(t)`。

**节点：**

- `place({ x, y, anchor, opacity, rotate, scale, origin, width, height, attrs }, ...children)`：定位一组内容。
- `text(str, style)`：单行文字。
- `box(style, ...children)`：flex 容器。
- `fx({ width, height, x, y, name }, draw)`：绘图层。
- `camera({ width, height, x, y, zoom, rotate, shakeX, shakeY }, ...children)`：镜头。
- `roll({ value, cell, size, axis, align }, items)`：滚动窗口。
- `reveal({ progress, width, height, direction, feather }, ...children)`：蒙版擦除。
- `typewriter(tokens, shown, style)`：打字机。
- `css(obj)`：样式对象转成样式字符串。
- 原始 flexlayer 节点用 `h(tag, attrs, ...children)`。

**draw 工具：**

- `font(size, weight)`：字体字符串。
- `drawGlyphs(ctx, str, { x, y, font, color, align, letterSpacing, each })`：逐字绘制。
- `measureGlyphs(ctx, str)`：量出每个字的位置。
- `strokeGlow(ctx, path, { color, width, glow })`：发光描边。
- `glowDot(ctx, x, y, r, color, alpha)`：径向光点。
- `sampleTextPoints(str, { font, width, height, step })`：把文字采样成点。
- `createCanvas(w, h)`：离屏画布。
- `rgba(hex, a)`、`mixColor(a, b, k)`、`colorRamp(stops, k)`：颜色。

**随机：**

- `rng(seed)`：可复现的随机数序列。
- `hash(i, seed)`：第 i 个元素的固定随机值。
- `noise1(x)`、`simplex2(x, y)`、`simplex3(x, y, z)`：噪声。
- `curl2(x, y, z)`：旋度噪声速度场。

**音频：**

- `AudioSpec { clips, buses, master }`：混音描述。
- `sfx(src, times, opts)`：同一个音效放在一组时间点上。
- `mixAudio(spec, { duration })`：直接混音。
- `renderAudio(comp, file)`：混成 WAV，同时给出报告。
- `analyzeAudio`、`formatAudioReport`、`drawWaveform`：电平分析和波形图。

**渲染：**

- `renderFrame(comp, t, { scale })`：渲染一帧。
- `renderStills(comp, times, { outDir })`：静帧加联系表。
- `renderVideo({ entry, out, workers, fps, scale, from, to })`：多进程渲染视频。
- `loadComposition(path)`：按路径加载合成。

## 5. 问题码在视频里怎么处理

问题码来自 flexlayer 的报告。多帧汇总后，每条都会给出出现了几帧、首末时间。在合成上配置 `lint: { ignore: [...] }` 可以忽略某类问题。

| 问题码 | 级别 | 视频里的处理 |
| --- | --- | --- |
| `overflow-canvas` | error | 震屏、推镜、入场前停在画外时出现，属于正常情况，可以忽略。但如果它出现在**静止段落**的文字上，就是真的越界，要修 |
| `min-font-size` | warn | 阈值按海报计算，横屏 1080p 下是 42.7px，偏严，可以忽略。视频里正文不小于 28px，HUD 和角标不小于 18px |
| `outside-safe` | warn | 推镜放大时出现，属于正常。静止段落的标题出现这个问题要修 |
| `text-overlap` | warn | 几乎总是 bug：常见原因是一个 layer 里放了两段文字却没有用 flex。交叉淡入淡出时短暂重叠可以接受 |
| `effect-clipped` | warn | 光晕被画布切掉。如果是边缘的装饰，可以忽略；如果是主体，就往里移 |
| `invalid-attr` / `invalid-child` / `unknown-tag` | warn/error | 写法错误，按 flexlayer 的 AGENTS.md 修改 |

flexlayer 的改动方案（视频检查配置、`bleed` 属性等）见 [docs/FLEXLAYER-CHANGES.md](docs/FLEXLAYER-CHANGES.md)。

## 6. 动效的基本功

具体代码见 [docs/RECIPES.md](docs/RECIPES.md)。原则：

- **每个动作都有起因：** 入场跟着节拍走，冲击跟着重音走，退场让位给下一个重点。
- **少用匀速：** 位移和缩放用 `spring` 或 `outCubic` / `outExpo`，退场用 `inCubic`。只有扫光、旋转这类持续运动才用匀速。
- **错开：** 一组元素同时出现会显得死板。用 `stagger(i, n, { each: 0.04–0.08, from: 'center' })` 错开。
- **预备和余韵：** 大动作前先反向收一下（蓄势），命中后让次要元素晚 50–100ms 跟上（跟随）。
- **冲击三件套：** 同一个 cue 上同时做闪白（`pulse` 驱动亮度或 `glowDot`）、震屏（`wiggle × pulse`）、轻微缩放（zoom +3–6%）。再配上音频的冲击声和音乐闪避。
- **层次：** 背景慢（周期 4–8 秒），主体中速，粒子和光点快。不同层的运动周期不同，画面才有纵深。
- **留白：** 每段结尾留 0.3–0.5 秒让画面停住，再进下一段。

## 7. 性能参考

以下数据来自 M 系列芯片，1920×1080，`scale` 为 1：

- **1080p 的 PNG 编码一帧约 300ms，比绘制本身慢得多。** showreel 的帧绘制只要几十毫秒，加上 PNG 编码就要约 300ms。
- `render` 命令不编码 PNG：它把原始像素直接交给 ffmpeg（`src/render/raw.ts`），单帧快约 10 倍，画面完全一致。48 秒、60fps 的 showreel 共 2880 帧，7 个进程并行，用时约 90 秒。改用原始像素之前，同样的渲染要 300 秒。
- `stills` 和 `check` 仍然输出 PNG，单帧约 300ms。所以抽帧检查时，`--every` 不要设得太密。
- 推镜放大很多倍时，带 `mask`、`blur`、`filter` 的元素会变慢：16 倍时，一张带 mask 的卡片单帧多出约 190ms。
- 草稿用 `--scale 0.5 --fps 30`，像素量是成片的四分之一，帧数减半。
- 预计算放进 `setup`：每个进程只跑一次。
