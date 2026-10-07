# flexlayer 改动方案（给 motionflexlayer 用）

本文列出 motionflexlayer 需要 flexlayer 配合的改动。每一项写清楚：现在的问题、建议的接口、motionflexlayer 里目前的临时做法（改完后删掉哪段代码）、验收方法。

motionflexlayer 现在**不依赖任何一项**就能跑：每项都有临时做法。改完一项，motionflexlayer 删一段绕路代码。

**状态核对于 flexlayer 0.2.20（4c6432a）。** 第 1、5、8 项已完成，motionflexlayer 已删掉对应的绕路代码；第 4 项部分完成。另外 flexlayer 新增的 `expect`、`data`、行内元素进报告、`flex-wrap`、`anchor-box="ink"`、`glyph()`、`canvas.create()` 的逐字位置、`ink-stroke`、`glass`、`extrude` 都已在示例里用上（`examples/ink`）。第 15–17 项是做 ink 示例时发现的。

| # | 优先级 | 改动 | 状态 | motionflexlayer 里受影响的代码 |
| --- | --- | --- | --- | --- |
| 1 | P0 | 打包：`prepare` + `files` | ✅ 已完成 | 依赖已改成 `github:ruochi/flexlayer#<commit>` |
| 2 | P0 | 导出字体与 canvas | 未做 | `src/canvas.ts` 整个文件 |
| 3 | P0 | `draw` 的 ctx 类型补全 | 未做 | `src/render/stills.ts` 里 `drawImage` 的强转 |
| 4 | P1 | 动画用的检查配置：`bleed`、视频字号阈值 | 部分：根上 `bleed`、元素上 `expect` 已有；嵌套 layer 的 `bleed`、视频字号阈值没有 | 示例里的 `lint.ignore: ['min-font-size']` |
| 5 | P1 | `origin` 支持任意点 | ✅ 已完成（0.2.19） | `camera()` 已改成一层 layer |
| 6 | P1 | 离屏画布按可见区域裁剪 | 未核实 | `MOTION.md` 里“镜头里别放 blur / mask”这条规则 |
| 7 | P1 | 行内 `span` 的变换与透明度 | 未做（文字整段可以 `style="scale:…"`） | `src/drawkit.ts` 的 `drawGlyphs` |
| 8 | P0 | 原始像素输出 | ✅ 已完成：`renderFrames({ format: 'rgba' })` | `src/render/raw.ts` 已删除 |
| 9 | P1 | 成组透明度 | 未做 | 无（现在没有绕路，只能接受瑕疵） |
| 10 | P2 | `draw` 里查询其它元素的盒子 | 未做 | 示例里手算的坐标 |
| 11 | P2 | 秒为单位的 `spring` | 未做 | 无（motionflexlayer 自带） |
| 12 | P2 | 层效果：`bloom`、`chroma` | 未做 | 示例里在 draw 里手画的光晕 |
| 13 | P1 | 单帧取原始像素、异步帧函数 | 新增 | `src/render/frame.ts` 的 `renderRgba` |
| 14 | P2 | `renderFrames` 的 `t` 由调用方给 | 新增 | 无 |
| 15 | P0 | 中文折行：句读落到行首 | 新增（缺陷） | `examples/ink/type.ts` 的 `headsOk`，以及换宽度时跳过坏宽度 |
| 16 | P1 | 合并子树墨迹时进 `g` | 新增（缺陷） | `examples/ink/kit.ts` 的 `glyphAt` 每字一层 layer |
| 17 | P2 | `canvas.create` 的字带上原文位置；竖排按列给 | 新增 | `examples/ink/page.ts` 的 `cells()`、`type.ts` 按 `x` 分列 |

---

## 1. 打包：`prepare` + `files`（P0，✅ 已完成）

flexlayer 现在有 `prepare` 和 `files`，`npm install github:ruochi/flexlayer` 会自动构建。motionflexlayer 的依赖已改成 `"flexlayer": "github:ruochi/flexlayer#<commit>"`，不再要求两个仓库放在同一级目录。

## 2. 导出字体与 canvas（P0）

**问题。**

- `DEFAULT_FONT_FAMILY`、`ensureDefaultFont`、`registerFontPath` 在 `src/fonts.ts` 里，没有从入口导出；`exports` 也不允许子路径导入。
- 预计算里要用离屏 canvas，比如把文字采样成粒子目标点。下游如果自己装一份 `@napi-rs/canvas`，就是两份原生实例，**字体注册表不互通**：flexlayer 注册的字体，下游 canvas 里量不到。

**motionflexlayer 现在的做法**（`src/canvas.ts`）：

- 从 `node_modules` 往上找 flexlayer 的真实目录，再用 `createRequire` 从那里加载 `@napi-rs/canvas`，以保证用的是同一份实例；
- 字体名直接写死成 `'ChillDuanSans'`；
- `ensureFonts()` 靠渲染一个 1×1 的 layer，触发字体下载和注册。

**建议。** 在 `src/index.ts` 增加以下导出：

```ts
export { DEFAULT_FONT_FAMILY, ensureDefaultFont, registerFontPath } from './fonts.js'
// 和 flexlayer 共用同一个原生实例，下游不要再自己装 @napi-rs/canvas
export { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
export type { Canvas, SKRSContext2D, Image } from '@napi-rs/canvas'
```

再加一个异步函数，不渲染也能预热字体：

```ts
/** 下载（如需要）并注册默认字体与给定字体。之后 draw 和离屏 canvas 都能用。 */
export async function initFonts(opts?: { fontsCacheDir?: string; fonts?: Array<{ family: string; src: string }> }): Promise<void>
```

**motionflexlayer 改完后。** `src/canvas.ts` 只剩几行重新导出，`findPackageDir` 和 `createRequire` 都删掉。

**验收。** 下游先 `await initFonts()`，再在 `createCanvas(100, 100)` 上 `measureText`，量出的宽度和 flexlayer 报告里同一段文字的 `ink.width` 一致，误差不超过 1px。

## 3. `draw` 的 ctx 类型补全（P0）

**问题。** `DrawFn` 的 `ctx` 用的是 `@napi-rs/canvas` 的 `CanvasRenderingContext2D` 类型，里面缺 `drawImage`、`createPattern`、`getTransform` 等方法，但它们运行时都存在。下游只能强转。

**建议。** `DrawFn` 改用 `SKRSContext2D`（napi 的完整类型），或者在 flexlayer 里补一份类型声明。顺便导出：

```ts
export type DrawContext = Parameters<DrawFn>[0]
```

**验收。** 在 `draw` 里写 `ctx.drawImage(offscreen, 0, 0)` 不需要强转也能通过 `tsc`。

## 4. 动画用的检查配置（P1）

**问题。** 现有检查是为单张海报设计的，放到视频里会出两类误报：

| 问题码 | 视频里的情况 | 现状 |
| --- | --- | --- |
| `overflow-canvas`（error） | 震屏、推镜、入场前停在画外、冲击波扩散，都会越出画布。这是设计的一部分 | 每帧都报 error，真正的越界淹没在里面 |
| `min-font-size`（warn） | 阈值是 `width / 1080 × 24`。横屏 1920 宽时阈值是 42.7px，HUD 用的 20–24px、字幕用的 32px 全部被报 | 只能整体忽略这条规则，真正太小的字也就查不出来了 |
| `outside-safe`（warn） | 推镜时，文字被放大越过安全区 | 同上 |

**建议。**

(a) `layer` 增加属性 `bleed`。子树允许越出画布，越出时不报 `overflow-canvas` 和 `outside-safe`，但 `effect-clipped` 照报。

```html
<layer bleed x="960" y="540" anchor="center" width="3840" height="2160" scale="2.4">…</layer>
```

motionflexlayer 的 `camera()` 会自动加上 `bleed`。

(b) 渲染选项增加 `profile`：

```ts
renderFvg(node, { t, profile: 'video' })
```

`profile: 'video'` 的规则：

- `min-font-size` 的阈值改按短边算：`min(width, height) / 1080 × 18`。1080p 下是 18px，4K 下是 36px；
- `overflow-canvas` 降为 warn，但只在元素的着墨**完全**在画布外时报。完全在画外的元素应该直接不渲染，这是性能问题而不是布局问题。

**motionflexlayer 改完后。** 示例里去掉 `lint: { ignore: ['overflow-canvas', 'min-font-size'] }`；`renderFrame` 默认传 `profile: 'video'`。

**验收。** hello、showreel 两个示例在 `profile: 'video'` 下逐帧检查，不出 error；故意放一行 12px 的字，仍然会报 `min-font-size`。

## 5. `origin` 支持任意点（P1，✅ 已完成）

flexlayer 0.2.19 起 `origin` 可以写任意一点：`"640 420"`、`"33% 39%"`、`"top 80"`，百分比按布局盒子算，支点可以在盒子外面。九宫格写法不变，`anchor` 仍只有九宫格。

motionflexlayer 的 `camera()` 从两层包裹改成一层：把 `(x, y)` 平移到画面中心，再以它为 `origin` 缩放、旋转。`place()` 的 `origin` 也接受 `'120 80'` 或 `[x, y]`。`test/nodes.spec.ts` 里验证了镜头只有一层、`origin` 写的是目标点。

## 6. 离屏画布按可见区域裁剪（P1）

**问题。** `blur`、`filter`、`grade`、`mask`、`glass` 会按“元素尺寸 × 当前变换的缩放”开离屏画布（见 `paint.ts` 的 `paintWithLayerFilter`：`createCanvas(tw * k, th * k)`）。推镜放大 16 倍时，一张 400×300 的卡片如果带 `mask`，离屏就是 6400×4800，还可能爆内存。实测单帧 `renderFvg`（包含 PNG 编码，画面大部分是黑色，编码较快）：缩放 1× 时 48ms，4× 时 57ms，16× 时 235ms。也就是说，放大 16 倍时多出约 190ms，全花在一张看不全的离屏上。可这张卡片在画面里能看到的部分，最多也就是 1920×1080。

**建议。** 离屏的尺寸和原点，取“元素的变换后包围盒”与“根画布（加上效果外扩）”的交集。交集为空时直接跳过这个元素。

**motionflexlayer 改完后。** `MOTION.md` 里删掉“镜头里不要放 blur / mask / grade”这条硬性约定。

**验收。** 一个带 `mask` 的 400×300 layer，放在 `scale="16"` 的父层里。修改前后渲染结果逐像素一致，16× 时的耗时和 1× 相差不超过 20ms。

## 7. 行内 `span` 的变换与透明度（P1）

**问题。** 逐字动画是动效里最常见的手法：每个字错开入场、波浪、逐字变色放大。flexlayer 的 HTML 文字只能整段做变换。motionflexlayer 现在有两种退路：

- 把字拆到 `draw` 里逐字画（`drawGlyphs`），但这样就失去了 flexlayer 的排版、折行、`glow` 等文字效果；
- 打字机靠“没打出来的字设成透明”来占位（`typewriter()`）。透明可以，但做不了位移和缩放。

**建议。** 让行内元素（`span`、`strong`、`b`、`em`）支持**只影响绘制、不影响排版**的属性，语义和 CSS `transform` 一样：

```html
<h1 style="font-size:120px">
  <span style="translate:0 40px; rotate:12deg; opacity:0.3">m</span><span style="translate:0 12px; opacity:0.8">o</span>…
</h1>
```

- `translate: x y`、`rotate: deg`、`scale: k`，支点是这段文字自己着墨框的中心；
- `opacity` 和外层透明度相乘；
- 排版时按没有变换来算行宽、折行，报告里的 `ink` 也按变换前给出。

再加一个可选的拆字语法糖，省得生成端自己拆：

```html
<h1 split="chars">motion</h1>   <!-- 等价于每个字一个 span，按 span[0..n] 编号 -->
```

**motionflexlayer 改完后。** 新增 `splitText(str, (i, n) => style)` 生成带变换的 span；hello 示例的标题从 `drawGlyphs` 改成 HTML 文字，就能直接用 `glow`。`drawGlyphs` 保留，给 `draw` 里的场景用。

**验收。** 带 `translate` 的 span 和不带时排版结果（`lines[].box`）一致；渲染出的字形整体平移了指定的距离。

## 8. 原始像素输出（P0，✅ 已完成）

flexlayer 的 `renderFrames(comp, { format: 'rgba' })` 直接给出不预乘的 RGBA，不再编码 PNG。motionflexlayer 删掉了拦截 `toBuffer` 的垫片（`src/render/raw.ts`），worker 改用 `renderRgba()`，见第 13 项。

**之后可以做的。** 运动模糊：每帧渲染 N 个子帧，在 JS 里平均。原始像素出来以后代价可以接受了。

## 9. 成组透明度（P1）

**问题。** `paintNode` 用 `globalAlpha *= opacity` 逐个子元素叠加透明度。一张卡片（背景加文字）淡出时，文字下面的卡片背景会透出来，重叠的地方颜色变深。设计软件和浏览器里，`opacity` 是对整组先合成再统一变透明。

**建议。** `layer` 在 `opacity < 1` 且子元素有重叠时，先画到离屏，再整体按 `opacity` 画回（同样按第 6 项裁到可见区域）。如果担心性能，也可以先做成可选属性 `isolate`，或者 `opacity-mode="group"`。

**验收。** 一张半透明卡片上的文字和卡片背景重叠处，颜色等于“不透明合成后乘以 opacity”。

## 10. `draw` 里查询其它元素的盒子（P2）

**问题。** 一些效果要知道其它元素排版后的位置：标题下面的手写下划线、连接两张卡片的线、聚光灯照向某个按钮。现在只能手算坐标，排版一改就对不上。

**建议。** `el` 增加查询方法，返回画布坐标系下的矩形（排版和变换都已经应用）：

```ts
draw: (ctx, el) => {
  const title = el.query('#title')        // { box, ink } | undefined
  const local = el.toLocal(title.ink)     // 换算到当前 draw 元素的局部坐标
}
```

实现上，要么在布局完成后、绘制开始前建好 id → 报告元素的索引，要么让 draw 延迟到所有布局完成后再执行。

## 11. 秒为单位的 `spring`（P2）

`spring({ frame, fps })` 内部已经是解析解，只是接口按帧算。可以加一个 `spring({ t })` 的重载，和 `el.t` 对上。motionflexlayer 自带 `spring(t, config)`，不依赖这一项。

## 12. 层效果：`bloom`、`chroma`（P2）

`draw` 只能往上叠颜色，读不到下面已经画了什么，所以真正的泛光（亮部扩散）和色差做不出来，只能用 `glow` 加手画光晕模拟。建议作为 `layer` 效果加入，实现方式和 `backdrop-blur` 一样基于离屏：

```html
<layer bloom="0.7 24 0.8">   <!-- 阈值 半径 强度 -->
<layer chroma="2">           <!-- 红蓝通道错开的像素数 -->
```

## 13. 单帧取原始像素、异步帧函数（P1，新增）

**问题。** 原始像素只能从 `renderFrames` 拿，而它要求 `component` 是同步函数。motionflexlayer 的帧函数可以是异步的（React 适配、按需加载数据），所以现在每一帧都要先求出节点树，再临时包一个只含这一帧的 composition 交给 `renderFrames`：

```ts
// src/render/frame.ts
const node = await nodeAt(comp, frame / comp.fps)
const frames = renderFrames({ …, durationInFrames: frame + 1, component: () => node }, { from: frame, to: frame, format: 'rgba' })
```

能用，但绕了一圈，每帧还要走一遍 `prepareAssets`。

**建议。** 二选一：

- `renderFvg(node, { t, frame, fps, format: 'rgba' })` 直接返回 `{ rgba, width, height, report }`；
- 或者 `Composition.component` 允许返回 `Promise<FvgNode>`。

**motionflexlayer 改完后。** `renderRgba` 变成一行调用。

**验收。** 同一棵节点树，`format: 'rgba'` 的像素和 `renderFrames` 给出的一致。

## 14. `renderFrames` 的 `t` 由调用方给（P2，新增）

`renderFrames` 用 `frame / fps` 算 `t`。motionflexlayer 的草稿模式会改 fps（60 改成 30），时间仍然对，但如果以后要做子帧（运动模糊），需要在同一帧号下传不同的 `t`。建议 `RenderFramesOptions` 加 `times?: number[]`，或者第 13 项的单帧接口接受任意 `t`。

## 15. 中文折行：句读落到行首（P0，新增，缺陷）

**问题。** `src/text.ts` 里 `glueUnits` 把不能出现在行首的标点（，。、；：？！）和前一个字粘在一起，但它是在 `wrapParagraph` 折完行之后、只在一行之内做的。折行时这些标点仍是独立的单位，所以可以被折到下一行的行首。

用 Kai 700、64px 排 `先排版，再拆字。每个字都知道自己落在哪一行、哪一格。笔画着墨之处，就是它该在的地方。`：

| 写法 | 出问题的尺寸 | 行首的标点 |
| --- | --- | --- |
| 横排，`line-height:1.6` | 宽 1500 | 。 |
| 横排，另一段文字 | 宽 700、760 | ； 、 |
| 竖排，`letter-spacing:0` | 高 400–460、540–680 | 。 、 ， |

横排宽 780–1200 没问题。

**motionflexlayer 现在的做法。** ink 示例排完版先查一遍行首（`headsOk`），拖动栏宽时遇到坏宽度就换下一个整数宽度。

**建议。** 把禁则粘连挪到折行之前：可断点的候选里去掉“标点之前”，或者折行时把行首标点连同前一个字一起推到下一行（推出），行尾放不下时允许标点悬挂（挤进）。

**验收。** 上面这段文字在横排宽 600–1600、竖排高 400–800 之间逐个整数尺寸扫一遍，行首都不是 ，。、；：？！。

## 16. 合并子树墨迹时进 `g`（P1，新增，缺陷）

**问题。** `layer` 上的 `ink-stroke`（以及 `shadow`、`glow` 的外扩轮廓）先合并整个子树的墨迹再描边。合并用的 `groupInkBounds` 和 `drawInkMask` 只往 `layer`、`flex` 里走，遇到 `g`（`kind: 'group'`）就当成叶子，而 `drawNodeInk` 对 group 什么也不画。结果是 `g` 里的路径不进描边：

```ts
h('layer', { 'ink-stroke': '12 #fff, 28 #e0432b' }, h('path', { d }))                               // 有描边
h('layer', { 'ink-stroke': '12 #fff, 28 #e0432b' }, h('g', { transform: 'translate(800,300)' }, h('path', { d })))  // 没有描边
```

**motionflexlayer 现在的做法。** `glyphAt` 给每个字形包一层 `layer`（`x`、`y`、`rotate`、`scale`），不用 `g`。

**建议。** `groupInkBounds`、`drawInkMask` 遇到 group 时按它的 `transform` 递归进子元素，和 layer 一样处理。

**验收。** 上面第二种写法和第一种渲染出同样的描边（位置差 `translate` 的距离）。

## 17. `canvas.create` 的字带上原文位置；竖排按列给（P2，新增）

**问题。**

- `text[].lines[].chars` 里没有折行处被吃掉的空格，所以“原文第 n 个字”和“chars 里第 n 个”对不上。要找某几个字的格子，只能把 `chars[].text` 拼起来再 `indexOf`。
- 竖排时 `lines` 是一格一项（每项一个字），同一列只能靠 `x` 相同来认。

**建议。** `PlacedChar` 加 `index`：这个字在节点原文里的偏移（UTF-16 或码点，写清楚是哪一种）。竖排时 `lines` 改成一列一项，或者每项加 `column`。

**验收。** 对含空格、会折行的英文混排段落，`chars[k].index` 指回原文里同一个字。

---

## 不需要 flexlayer 改的

下面这些放在 motionflexlayer 里做，flexlayer 不用管：

- 时间轴、节拍、cue、段落；
- 镜头、震屏、滚动、擦除、打字机这些原语；
- 多进程渲染、ffmpeg；
- 旁白合成与排期；
- 音频混音（由 visualtone 负责）；
- React 适配：motionflexlayer 用 `react-reconciler` 直接产出 `FvgNode`，`draw` 闭包原样保留，不走 `generate/react` 的字符串序列化；
- 第二版的 Vue 适配：同样用 `@vue/runtime-core` 的自定义渲染器直接产出 `FvgNode`。
