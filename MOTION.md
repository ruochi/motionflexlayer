# Motion Flex Layer：给模型的动画入口

本文是给模型的入口。照着这里的流程做，产出一支带旁白、音乐和音效的视频。

- **标签和属性：** flexlayer 的 [SPEC.md](https://github.com/ruochi/flexlayer/blob/main/SPEC.md)。静态写法的规则见 flexlayer 的 [AGENTS.md](https://github.com/ruochi/flexlayer/blob/main/AGENTS.md)，它们在这里同样适用。
- **旁白：** [docs/NARRATION.md](docs/NARRATION.md)。
- **动效手法：** [docs/RECIPES.md](docs/RECIPES.md)。
- **音频：** [docs/AUDIO.md](docs/AUDIO.md)。声音由 [visualtone](https://github.com/ruochi/visualtone) 渲染。
- **React 写法：** [docs/REACT.md](docs/REACT.md)。

## 0. 标准输入流程

拿到需求后按这个顺序走，每一步的产物都是下一步的输入：

| 步骤 | 产物 | 用什么 |
| --- | --- | --- |
| 1. 需求（brief） | 一句话目的、观众、时长、画幅、语气、必须出现的信息 | 先写下来，不确定的地方按常识定，并在总结里说明 |
| 2. 文案 | 每句一个 id 的旁白稿；没有旁白时写段落表 | 每句只讲一件事，中文每句 12–28 字 |
| 3. 旁白 | 音频、逐词时间、每段时长 | `narration(lines, opts)`，结果缓存进仓库 |
| 4. 时间轴 | 段落、cue | `vo.timeline()`；纯音乐片用 `timeline({ bpm })` |
| 5. 画面 | `render(f)` | 节点原语 + `draw`，时间点全部取自时间轴 |
| 6. 声音 | `audio` | 旁白进 `voice` 母线，音乐 `duck.by: 'voice'`，音效放在 cue 上 |
| 7. 检查 | 联系表、排版报告、音频报告 | `stills` → `check` → `audio` |
| 8. 渲染 | mp4 | `render` |

时长由谁决定：

- **有旁白时，旁白决定时长。** 不要先定“每段 4 秒”再让旁白去凑。先念，再按念出来的长度排段落；画面要多停一会儿，用 `minDuration` 或 `post` 加。
- **没有旁白时，音乐决定时长。** 先定 BPM，段落落在小节线上。
- 两者都有时，段落仍按旁白排；音乐的和弦或乐句按段落起止编排，见 `examples/narrated`。

### 别让每支片子都一个样

框架不带任何视觉风格。示例只是演示写法，不是模板。每支片子的风格从需求里来：

- **先定三件事再写代码：** 色板（3–5 个颜色，写成常量）、字体与字重层级、运动语汇（干脆利落的硬切，还是柔和的弹簧，还是缓慢的推移）。三件事都要能用需求里的一句话解释。
- **不要照搬示例的配色和版式。** 深底加青橙光效是 showreel 的风格，米色纸面加红色强调是 narrated 的风格。新片子要换掉。
- **转场方式跟着内容变：** 列举用逐项入场，对比用分屏，因果用连线或推镜，数字用滚动计数。全片只用一种淡入淡出，就会显得单调。
- **声音也一样：** 和弦进行、音色（`hue`、`engine`）、音效选择都按语气定。轻松的片子用 `pluck` / `marimba` 和 `pop`，严肃的用 `wavetable` 铺底和 `swell`。

## 1. 心智模型

一支视频就是一个**纯函数**：`t（秒）→ 一帧 flexlayer 文档`。没有“上一帧”，没有状态。

```text
文案 → 旁白（TTS，缓存）
           ↓
时间轴（段落、cue、逐词时间；或节拍）
   ├── 帧函数：render(f) → layer 树          画面（可读 f.audio 的电平和起音）
   └── 音频：AudioSpec → visualtone 乐谱      声音（渲染一次，算出包络）
           ↓
   stills / check / audio 报告                验证
           ↓
   render：N 个进程 → ffmpeg → mp4
```

| 层 | 用什么 | 负责 |
| --- | --- | --- |
| 结构 | `layer`、HTML 文字、`div` 的 flex，以及 `place` / `roll` / `reveal` / `typewriter`；镜头用 `view` 取景，参数由 `shot()` 算 | 有哪些东西、在哪、什么时候出现、怎么排 |
| 像素 | `draw` 回调：`fx()` 或任意自定义标签 | 笔触、粒子、光效、数据图、3D 点云 |
| 时间 | `timeline()`、`progress` / `fade` / `spring` / `pulse` / `stagger` | 一切数值随 t 变化 |
| 声音 | `audio.clips`、`buses`、`duck`、`tracks` | 旁白、音乐、音效放到 cue 上，由 visualtone 混音 |
| 旁白 | `narration()`、`vo.caption(t)` | 合成语音，排出段落，逐词字幕 |

## 2. 硬性约定

| 规则 | 错误写法 | 正确写法 | 不遵守会怎样 |
| --- | --- | --- | --- |
| 时间一律用秒，动画只依赖 `f.t` | `x = frame * 4`、按帧号写 if | `x = tween(f.t, 1, 1.6, 0, 400, 'outCubic')` | 改了 fps，动画就变速 |
| 帧函数必须是纯函数 | `Math.random()`、`Date.now()`、在 render 里改模块变量、`pos += vel` | `rng(seed)`、`hash(i, seed)`、解析式，或预计算的表 | 多进程乱序渲染，画面会抖动、闪烁 |
| 重计算放进 `setup` | 每帧跑一次粒子模拟、采样文字 | `setup` 里按固定频率模拟，帧函数里查表插值 | 每帧慢几百毫秒 |
| 所有时间点都来自时间轴 | 画面写 `4.0`，音效写 `4.02` | `tl.cue('impact', tl.bar(2))`，两边都读 `tl.times('impact')` | 声音和画面对不上 |
| 定位用 `x`、`y`、`anchor` | `h('layer', { cx: 960, cy: 540 })` | `place({ x: 960, y: 540 })`（默认 `anchor: 'center'`），原始节点写 `h('layer', { x: 960, y: 540, anchor: 'center' })` | flexlayer 0.2 起 `cx`、`cy` 在 layer 上无效，报 `invalid-attr` |
| 嵌套 `layer` 只定位，不排版 | 一个 `layer` 里并排放两段文字 | `place({…}, box({ display: 'flex', gap: 12 }, a, b))` | 文字叠在一起，报 `text-overlap` |
| 嵌套 `layer` 不填背景 | `h('layer', { background: '#fff' })` | 用 `rect`、HTML `background` 或 `draw` | `invalid-attr` |
| 推镜、震屏用取景窗，不缩放整个画面 | `place({ x: 960, y: 540, width: W, height: H, scale: zoom, origin: [x, y] }, …scene)` | `const cam = shot({ width: W, height: H, x, y, zoom })`，再写 `h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, …scene))` | 出画的元素每帧报 `overflow-canvas`，字号按名义大小查，露底也查不出来 |
| 章节、字幕、标注写在取景窗外 | 把字幕放进舞台层，跟着镜头一起放大 | 取景窗外用成片像素；要跟住舞台上的一点用 `cam.toScreen(x, y)` | 字幕跟着推近、震动，读不清 |
| 舞台里不放 `blur` / `mask` / `grade` / `glass` 再推很近 | `shot({ zoom: 16 })` 推向一张带 `mask` 的卡片 | 带这些效果的元素放到舞台外，或者只在 zoom 不大的时候用；调色写在取景窗那层上 | 离屏画布按放大后的尺寸分配，16 倍时单帧多出约 400ms |
| 动画文字不换行 | 让 `p` 自动折行 | `text()` 默认 `white-space:nowrap` | 字距、字号变化时整段重排，画面跳动 |
| 逐字动画放在 `draw` 里 | 给 `span` 写 `transform` | `drawGlyphs(ctx, str, { each })` | `span` 不支持变换，属性被忽略 |
| 在 `canvas.create` 的结果里按 id 找字 | 按原文的序号数 `lines[].chars` | 要找的字包一层 `<span id="here">`，取 `chars.filter((c) => c.id === 'here')` | 折行处的空格不占格，序号会错开；竖排时 `lines` 是一格一项，按 `x` 分列 |
| `draw` 里不重置变换 | `ctx.setTransform(1, 0, 0, 1, 0, 0)`、`ctx.reset()` | 用 `ctx.save()` / `translate` / `restore()` | 破坏 flexlayer 的定位和 `scale` 倍率，导出半分辨率时位置错乱 |
| `draw` 里不分配大对象 | 每帧 `createCanvas(1920, 1080)` | 在模块顶层或 `setup` 里建好，复用 | 内存上涨，越来越慢 |
| 看不见的元素就不输出 | 透明度为 0 的层仍然放进文档 | `place()` 在透明度约为 0 时返回 `null`；条件渲染写 `cond && node` | 白白排版、绘制 |
| React 里每帧都是新挂载 | 用 `useState` / `useEffect` 存动画状态 | 只用 `useFrame()` 和纯计算，`useMemo` 只做帧内去重 | 状态每帧丢失 |
| 预期中的问题写 `expect` | 整个合成 `lint.ignore: ['text-overlap']` | 在那个元素上写 `attrs: { expect: 'text-overlap: 交叉淡化' }` | 真正的 bug 被一起忽略 |
| 音量看报告，不靠猜 | 直接把增益都设成 0 dB | 跑 `audio` 命令：响度 -16 LUFS 左右，有旁白时“旁白高出音乐”≥ 6 dB，没有 ⚠ | 削波、旁白听不清，或者全片一样响 |
| 旁白文字和字幕是同一份 | 字幕另写一遍 | 字幕用 `vo.caption(f.t)` | 改了文案，字幕和声音对不上 |

## 3. 工作流

### 第一步：时间轴

**有旁白时，**先写文案，念出来，再从旁白生成时间轴：

```ts
import { narration } from 'motionflexlayer'

const vo = await narration(
  [
    { id: 'hook', text: '一句话说清楚这支片子要讲什么。' },
    { id: 'how', text: '第二句展开，画面跟着这一句变化。', minDuration: 4 },
  ],
  { baseDir: import.meta.url, voice: 'zh-CN-XiaoxiaoNeural' },
)
const tl = vo.timeline()          // 每句一段，段名就是 id；另有 'line'、'word' 两组 cue
```

模块顶层可以直接 `await`。旁白缓存在入口旁边的 `voice/` 目录，提交进仓库，渲染时不再联网。详见 [docs/NARRATION.md](docs/NARRATION.md)。

**没有旁白时，**先定节奏，再定画面。BPM 决定一切时间点：120 BPM 时一拍 0.5 秒、一小节 2 秒，4 小节（8 秒）一段。

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
import { defineComposition, h, shot, place, text, fx, progress, spring, pulse, wiggle } from 'motionflexlayer'

export default defineComposition({
  width: 1920, height: 1080, fps: 60, duration: 24,
  background: '#07080d', color: '#f4f1ea',
  timeline: tl,
  setup: async () => { /* 预计算 */ },
  render: (f) => {
    const hit = pulse(f.t, tl.times('impact'), 6)       // 冲击包络：1 → 0
    const cam = shot({ width: 1920, height: 1080, zoom: 1 + 0.05 * hit, shakeX: wiggle(f.t, 18, 12 * hit, 1) })
    return [
      // 取景窗 + 舞台两层：窗口铺满画面，view 取舞台的一块
      h('layer', { width: 1920, height: 1080, view: cam.view },
        h('layer', cam.stage,
          fx({ width: 1920, height: 1080 }, (ctx) => { /* 背景、粒子 */ }),
          place({ x: 960, y: 540 - (1 - spring(f.t - tl.at('title'))) * 80, opacity: progress(f.t, 2, 2.3) },
            text('标题', { fontSize: 120, fontWeight: 800 })),
        ),
      ),
      // HUD 写在取景窗外，用成片像素，不跟着震
    ]
  },
})
```

- `render` 返回内容就行，根 `layer`（尺寸、底色）由框架生成；
- 返回数组里可以有 `null` / `false`；
- 结构用节点原语，像素用 `fx` 的 `draw`。

字幕直接读旁白：

```ts
const c = vo.caption(f.t)        // { line, spoken, word, progress, speaking }
// line.text.slice(0, spoken) 是念过的部分，word 是正在念的词
```

画面要跟着声音动（电平表、随旁白跳动的波形、音效起音时闪一下），在合成上写 `envelopes: true`，帧函数里读 `f.audio`：

```ts
f.audio!.level('voice')            // 旁白此刻的 RMS 电平，线性
f.audio!.since('fx')               // 距上一个音效起音多少秒
f.audio!.at(f.t - 0.5).db('music') // 半秒前音乐的电平，画历史曲线用
```

包络在渲染前算好一次，仍然是 t 的纯函数。

### 第三步：音频

```ts
audio: ({ tl }) => ({
  clips: [
    ...vo.clips(),                                                       // 旁白，进 'voice' 母线
    { src: 'music/bed.wav', loop: true, gain: -8, fadeIn: 1, bus: 'music' },
    ...sfx('sfx/impact.wav', tl.times('impact'), { gain: -3 }),
  ],
  buses: {
    music: { duck: { by: 'voice', depth: 0.6, band: [1000, 4000] } },   // 旁白说话时，音乐让出人声频段
  },
  tracks: [                                                              // visualtone 原生音轨：音符、内置音效
    { id: 'fx', role: 'sfx', sfx: [{ sfx: 'whoosh', t: tl.at('how') - 0.2 }] },
  ],
  master: { lufs: -16, fadeOut: 1.5 },
})
```

文件路径相对于合成入口所在的目录。混音由 visualtone 完成：响度按 LUFS 对齐、限幅器兜底、同样输入同样输出。音源也可以是函数（程序化合成器），见 [docs/AUDIO.md](docs/AUDIO.md)。

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
   - 响度接近目标（默认 -16 LUFS），限幅不超过 3 dB；
   - 有旁白时，“旁白：1–4 kHz 高出音乐”至少 6 dB，音效每 10 秒不超过 visualtone 档案的上限；
   - 报告里的 ⚠ 逐条处理，· 酌情处理；
   - 纯音乐片：各段 RMS 有起伏，高潮比开场响 6–10 dB；每个重要 cue 的“跳变”大于 3 dB；
   - 打开波形图看包络，确认它和画面节奏一致。
5. **成片：** 用 ffmpeg 抽几帧，和 stills 对比，确认多进程渲染的结果和单帧一致。

模型听不到声音，所以音频的“好听”只能靠结构来保证：

- 节拍对齐：音效都放在 cue 上；
- 层次：旁白、音乐、音效分开母线，音乐给旁白和底鼓让路；
- 频段：旁白占 1–4 kHz，音乐别去填这一段；
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
- 登记：`.cue(name, t | t[], data)`、`.section(name, from, data)`。cue 的 data 写 `audit: false`，音频报告就不检查它（旁白的 cue 默认如此）。
- 读取：`.times(name)`、`.at(name)`、`.cues(name)`、`.last(name, t)`、`.sectionAt(t)`。

**旁白：**

- `narration(lines, { baseDir, voice, rate, cacheDir, offline, lead, gap, hold, tail })`：合成并排期，返回 `Narration`。
- `vo.lines`：每句的 `from`/`to`（段落）、`speechFrom`/`speechTo`（开口、收声）、`words`（逐词时间和字符位置）。
- `vo.timeline({ bpm })` / `vo.apply(tl)`：登记段落和 cue。
- `vo.caption(t)`：字幕读数。`vo.clips({ bus, gain })`：旁白片段。`vo.line(id)`、`vo.lineAt(t)`、`vo.words`。
- `edgeTts`、`synthesizeCached`：TTS 引擎和缓存，换引擎实现 `TtsEngine` 即可。

**节点：**

- `place({ x, y, anchor, opacity, rotate, scale, origin, width, height, attrs }, ...children)`：定位一组内容。`anchor` 默认 `center`，只能是九宫格；`origin` 是缩放、旋转的支点，可以是九宫格、`'120 80'`、`'30% 40%'`，或 `[x, y]`（相对这一层的左上角）；`attrs` 里可以写 `expect`、`glow`、`overflow` 等。
- `text(str, style)`：单行文字。
- `box(style, ...children)`：flex 容器。
- `fx({ width, height, x, y, name }, draw)`：绘图层。
- `shot({ width, height, stage, x, y, zoom, rotate, shakeX, shakeY, cover })`：镜头参数，纯函数。返回 `view`（写在取景窗那层）、`stage`（舞台层的宽高，有旋转时带 `rotate` 和 `origin`）、实际的 `zoom` 和 `toScreen(x, y)`。`(x, y)` 是舞台上要对准的点，落在取景窗中心；`shakeX`、`shakeY` 是成片像素；默认把 `zoom` 抬到刚好盖满舞台，`cover: false` 关掉。取景窗多大、放在哪、几个窗口取同一个舞台，都由调用方自己写。
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

- `AudioSpec { clips, buses, tracks, master, bpm }`：混音描述，编译成 visualtone 乐谱。
- `sfx(src, times, opts)`：同一个音效放在一组时间点上。
- `mixAudio(spec, { duration, envelopeFps, stems })`：直接混音。`compileAudio(spec)` 只编译不渲染。
- `renderAudio(comp, file)`：混成 WAV，同时给出报告和乐谱。
- `f.audio`（合成写 `envelopes: true`）：`level(track)`、`db(track)`、`onsets(track)`、`since(track)`、`at(t)`。
- `analyzeAudio`、`formatAudioReport`、`drawWaveform`：电平分析和波形图。

**渲染：**

- `renderFrame(comp, t, { scale })`：渲染一帧（PNG）。`renderRgba(comp, frame, { scale })`：原始像素。
- `renderStills(comp, times, { outDir })`：静帧加联系表。
- `renderVideo({ entry, out, workers, fps, scale, from, to })`：多进程渲染视频。
- `loadComposition(path)`：按路径加载合成。

## 5. 问题码在视频里怎么处理

问题码来自 flexlayer 的报告。多帧汇总后，每条都会给出出现了几帧、首末时间。

预期中的问题写在那个元素上：`place({ …, attrs: { expect: 'overflow-canvas: 入场前停在画外' } })`。命中的问题降为 info；写了却没出现，报 `unused-expect`，所以 expect 要和实际情况一起开关（例如只在重叠的那几帧写）。要判断某一帧该不该写，可以用 `cam.toScreen` 算出元素在屏幕上的位置，见 showreel 的 `card()`。整类忽略用合成上的 `lint: { ignore: [...] }`，现在的示例都不需要。

推镜、震屏用 `view` 取景：取景窗裁掉的部分不报 `overflow-canvas`，字号按屏幕上的大小查。`bleed` 已从 flexlayer 删除。

| 问题码 | 级别 | 视频里的处理 |
| --- | --- | --- |
| `overflow-canvas` | error | 推镜、震屏写成取景窗之后，窗外的部分不再报。入场前停在画外、冲击波扩散时出现，在那个元素上写 `expect`。如果出现在**静止段落**的文字上，就是真的越界，要修 |
| `view-outside` | error | 取景超出了舞台，成片会露底。用 `shot()` 默认的 `cover` 会把 zoom 抬到盖满；自己写 `view` 时检查对准的点和倍数 |
| `min-font-size` | warn | 拿屏幕上的字号（乘了 `scale` 和 `view` 的倍数）和 `min(宽, 高) / 1080 × 24` 比，1080p 下是 24px。HUD、角标也不小于 24px；缩着入场、收走的那几帧写 `expect` |
| `outside-safe` | warn | 只比较左右。推近时被取景窗左右边缘裁开的正文也会报，写 `expect`。静止段落的标题出现这个问题要修 |
| `text-overlap` | warn | 几乎总是 bug：常见原因是一个 layer 里放了两段文字却没有用 flex。交叉淡入淡出时短暂重叠可以接受，在先画的那个元素上写 `expect` |
| `unused-expect` | warn | 写了 `expect` 但这一帧没出现。把 expect 的开关条件改准 |
| `ink-inset` | info | 字形比盒子靠里。要让笔画贴齐定位点，写 `anchor-box="ink"` |
| `effect-clipped` | warn | 光晕被画布切掉。如果是边缘的装饰，可以忽略；如果是主体，就往里移 |
| `invalid-attr` / `invalid-child` / `unknown-tag` | warn/error | 写法错误，按 flexlayer 的 AGENTS.md 修改 |

还需要 flexlayer 配合的改动见 [docs/FLEXLAYER-CHANGES.md](docs/FLEXLAYER-CHANGES.md)。

## 6. 动效的基本功

具体代码见 [docs/RECIPES.md](docs/RECIPES.md)。原则：

- **每个动作都有起因：** 入场跟着节拍走，冲击跟着重音走，退场让位给下一个重点。
- **少用匀速：** 位移和缩放用 `spring` 或 `outCubic` / `outExpo`，退场用 `inCubic`。只有扫光、旋转这类持续运动才用匀速。
- **错开：** 一组元素同时出现会显得死板。用 `stagger(i, n, { each: 0.04–0.08, from: 'center' })` 错开。
- **预备和余韵：** 大动作前先反向收一下（蓄势），命中后让次要元素晚 50–100ms 跟上（跟随）。
- **冲击三件套：** 同一个 cue 上同时做闪白（`pulse` 驱动亮度或 `glowDot`）、震屏（`wiggle × pulse`）、轻微缩放（zoom +3–6%）。再配上音频的冲击声和音乐闪避。
- **跟着旁白：** 画面的变化落在关键词的开口时刻（`vo.line(id).words.find(…).from`），而不是段落开头。观众听到“重叠”时，画面上正好出现重叠。
- **层次：** 背景慢（周期 4–8 秒），主体中速，粒子和光点快。不同层的运动周期不同，画面才有纵深。
- **留白：** 每段结尾留 0.3–0.5 秒让画面停住，再进下一段。

## 7. 性能参考

以下数据来自 4 核云主机，1920×1080，`scale` 为 1：

- `render` 用 flexlayer 的 `renderFrames({ format: 'rgba' })` 取原始像素直接交给 ffmpeg，不编码 PNG。narrated 示例（32.6 秒、30fps、978 帧）4 个进程约 28 秒，其中约 17 秒是先混音算包络。
- `stills` 和 `check` 仍然输出 PNG，1080p 单帧可能要几百毫秒。抽帧检查时，`--every` 不要设得太密；`check` 默认 `--scale 0.25`。
- 推镜放大很多倍时，带 `mask`、`blur`、`filter` 的元素会变慢：16 倍时，一张带 mask 的卡片单帧多出约 190ms。
- 草稿用 `--scale 0.5 --fps 30`，像素量是成片的四分之一。
- 预计算放进 `setup`：每个进程只跑一次。
- 旁白第一次合成要联网，之后读缓存；`MFL_TTS_OFFLINE=1` 时缓存缺失直接报错。
