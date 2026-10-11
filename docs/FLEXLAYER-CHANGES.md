# flexlayer 改动方案（给 motionflexlayer 用）

本文列出 motionflexlayer 需要 flexlayer 配合的改动。每一项写清楚：现在的问题、建议的接口、motionflexlayer 里目前的临时做法（改完后删掉哪段代码）、验收方法。

motionflexlayer 现在**不依赖任何一项**就能跑：每项都有临时做法。改完一项，motionflexlayer 删一段绕路代码。

**状态核对于 flexlayer 0.2.30（db6ef3b）。** 第 1、4、5、8、15、16 项已完成，motionflexlayer 已删掉对应的绕路代码；第 17 项部分完成。第 4 项没有按下面的 `bleed` / `profile` 方案做，而是换成了更好的 `view` 取景：取景窗裁掉的不报 `overflow-canvas`，最小字号按屏幕上的大小和短边算。另外 flexlayer 新增的 `expect`、`data`、行内元素进报告、`flex-wrap`、`anchor-box="ink"`、`glyph()`、`canvas.create()` 的逐字位置和 `elements`、`ink-stroke`、`glass`、`extrude` 都已在示例里用上（`examples/ink`）。

| # | 优先级 | 改动 | 状态 | motionflexlayer 里受影响的代码 |
| --- | --- | --- | --- | --- |
| 1 | P0 | 打包：`prepare` + `files` | ✅ 已完成 | 依赖已改成 `github:ruochi/flexlayer#<commit>` |
| 2 | P0 | 导出字体与 canvas | 未做 | `src/canvas.ts` 整个文件 |
| 3 | P0 | `draw` 的 ctx 类型补全 | 未做 | `src/render/stills.ts` 里 `drawImage` 的强转 |
| 4 | P1 | 动画用的检查配置 | ✅ 已完成：`view` 取景 + 屏幕字号（0.2.22、0.2.30） | 示例里的 `lint.ignore` 已全部删掉；`camera()` 换成 `shot()` |
| 5 | P1 | `origin` 支持任意点 | ✅ 已完成（0.2.19） | `place()` 的 `origin` 接受 `[x, y]` |
| 6 | P1 | 离屏画布按可见区域裁剪 | 未做（0.2.30 实测） | `MOTION.md` 里“镜头里别放 blur / mask”这条规则 |
| 7 | P1 | 行内 `span` 的变换与透明度 | 未做（文字整段可以 `style="scale:…"`） | `src/drawkit.ts` 的 `drawGlyphs` |
| 8 | P0 | 原始像素输出 | ✅ 已完成：`renderFrames({ format: 'rgba' })` | `src/render/raw.ts` 已删除 |
| 9 | P1 | 成组透明度 | 未做 | 无（现在没有绕路，只能接受瑕疵） |
| 10 | P2 | `draw` 里查询其它元素的盒子 | 未做 | 示例里手算的坐标 |
| 11 | P2 | 秒为单位的 `spring` | 未做 | 无（motionflexlayer 自带） |
| 12 | P2 | 层效果：`bloom`、`chroma` | 未做 | 示例里在 draw 里手画的光晕 |
| 13 | P1 | 单帧取原始像素、异步帧函数 | 新增 | `src/render/frame.ts` 的 `renderRgba` |
| 14 | P2 | `renderFrames` 的 `t` 由调用方给 | 新增 | 无 |
| 15 | P0 | 中文折行：句读落到行首 | ✅ 已完成 | `headsOk` 已删除 |
| 16 | P1 | 合并子树墨迹时进 `g` | ✅ 已完成 | 无（`glyphAt` 每字一层 layer 只为绕字身中心转） |
| 17 | P2 | `canvas.create` 的字带上原文位置；竖排按列给 | 部分：字带上所在 span 的 `id` | `examples/ink/page.ts` 的 `cells()` 已改成按 id 取；`type.ts` 竖排仍按 `x` 分列 |
| 18 | P2 | 被取景窗裁开的文字和 `outside-safe` | 新增 | `examples/ink/page.ts`、`showreel` 卡片上的 `expect` |
| 19 | P2 | 三维镜头：`behind-camera` 的口径、嵌套平面复合姿态、斜平面上的 `text-overlap` | 新增 | `src/shot3d.ts` 的 `pose()`、`examples/orbit` 卡片上的 `expect` |
| 20 | P1 | `perspective` 改成多值的镜头属性：焦距、对准点、机位、主点偏移 | 新增 | `src/shot3d.ts` 的 `pose()` / `place()` 整段；包含第 19 项的 `behind-camera` 口径 |

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

## 4. 动画用的检查配置（P1，✅ 已完成）

原来的问题：海报用的检查放到视频里，震屏、推镜时每帧都报 `overflow-canvas`，最小字号阈值是 `宽 / 1080 × 24`（横屏 1080p 下 42.7px），示例只能整类忽略。

flexlayer 没有按这里原先提的 `bleed` / `profile: 'video'` 做，而是加了 `view` 取景（0.2.22），后来又按短边算字号（0.2.30）：

- `<layer width height view="x y w h">` 取舞台的一块铺满取景窗，窗外裁掉，不报 `overflow-canvas`；
- `view` 没被直接子元素（转完、缩完的四边形）盖住时报 `view-outside`（error），露底能查出来；
- 最小字号拿屏幕上的字号（`font-size × screenScale`）和 `min(宽, 高) / 1080 × 24` 比，1080p 横屏、竖屏都是 24px；
- 阴影、光晕的外扩也按屏幕算；`bleed` 已删除。

**motionflexlayer 改完了。** `camera()` 换成纯函数 `shot()`，算出 `view`、舞台层属性和 `toScreen`，结构由用户写两层 layer。hello、hello-react、showreel、ink 都去掉了 `lint.ignore`，逐帧检查没有 warn 以上的问题。

## 5. `origin` 支持任意点（P1，✅ 已完成）

flexlayer 0.2.19 起 `origin` 可以写任意一点：`"640 420"`、`"33% 39%"`、`"top 80"`，百分比按布局盒子算，支点可以在盒子外面。九宫格写法不变，`anchor` 仍只有九宫格。

motionflexlayer 的 `place()` 的 `origin` 接受 `'120 80'` 或 `[x, y]`。`shot()` 的旋转也靠它：舞台层以对准的点为 `origin` 转。

## 6. 离屏画布按可见区域裁剪（P1）

**0.2.30 实测仍然存在，`view` 也一样。** 舞台里放一段带 `blur` 的字和一段带 `grade` 的字，整帧渲染：1× 约 90ms，4× 约 140ms，16× 约 470ms；用 `scale` 推近和用 `view` 推近几乎相同。

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

## 15. 中文折行：句读落到行首（P0，✅ 已完成）

flexlayer 改用 `linebreak` 断行，并避开行首标点。ink 示例那段文字在横排宽 700–1260 逐个整数宽度扫过一遍，行首都不是 ，。、；：？！。`examples/ink/type.ts` 的 `headsOk` 和跳过坏宽度的重试已删除。

## 16. 合并子树墨迹时进 `g`（P1，✅ 已完成）

`layer` 的 `ink-stroke`、`shadow` 合并子树墨迹时会走进 `g`。`glyphAt` 仍然每个字一层 `layer`，因为这样旋转、缩放可以直接绕字身中心，不再是为了绕开这个缺陷。

## 17. `canvas.create` 的字带上原文位置；竖排按列给（P2，部分完成）

**已完成。** 最内层写了 `id` 的行内标签拥有的字，`chars[]` 上带这个 `id`；`canvas.create` 还返回 `elements`，每个元素有布局盒和变换后的外接框。ink 示例把要看的字写成 `<span id="here">这里</span>`，`cells('here')` 直接按 id 取，不再把 `chars[].text` 拼起来 `indexOf`。

**还没有。**

- `PlacedChar` 没有原文偏移。不想为了定位包 span 的时候，仍然只能按文字找；
- 竖排时 `lines` 仍是一格一项，同一列靠 `x` 相同来认（`examples/ink/type.ts`）。

**建议。** `PlacedChar` 加 `index`（写清楚是 UTF-16 还是码点）。竖排时每项加 `column`。

## 18. 被取景窗裁开的文字和 `outside-safe`（P2，新增）

**问题。**

- 推近一整页正文时，被取景窗左右边缘裁开的段落每帧都报 `outside-safe`。`overflow-canvas` 对取景窗裁掉的部分已经不报，`outside-safe` 却照报，两条规则口径不一致；
- `outside-safe` 只比较左右，不比较上下；SPEC 的问题码表里没写这一点，示例里按屏幕位置写 `expect` 时踩过。

**motionflexlayer 现在的做法。** ink 的页面、showreel 的卡片上按帧写 `expect: 'outside-safe: …'`；showreel 用 `shot().toScreen` 算卡片文字在屏幕上的位置，只在真越界的帧写。

**建议。** 二选一并写进 SPEC：

- 被 `view` 窗口边缘裁开的文字不报 `outside-safe`（和 `overflow-canvas` 一致），只看仍在窗内的部分；
- 或者保持现状，但在 SPEC 里写明“推近时被取景窗裁开的文字会报，按帧写 `expect`”，以及“只比较左右”。

## 19. 三维镜头（P2，新增）

motionflexlayer 的 `shot3d()` 把机位变换乘进每个物体，算出 `perspective` 层直接子元素的 `x`、`y`、`z`、`rotateX`、`rotateY`、`rotate`、`origin`。0.2.30 下能用，有三处绕路或瑕疵：

**`behind-camera` 的口径。** `perspectiveIssues` 拿 `z` 属性和视距比，绘制拿平面中心的真实深度（`planeDepth`、网格支点的深度）比。`z` 加在旋转之前、沿平面自己的法线走，贴地的平面在低机位下法线几乎平行于画面，要很大的 `z` 才能放到该在的深度：中心明明在观众前面、也画出来了，却报 `behind-camera`。

- motionflexlayer 现在的做法：给了 `width`、`height` 时，`pose()` 把深度按最小范数分摊到 `z` 和 `origin` 的偏移上，`|z|` 不超过真实深度；
- 建议：检查也用 `planeDepth(child) >= perspective`，和绘制同一口径；
- 改完后：`pose()` 不再需要挪 `origin`，没给宽高的物体也不会误报。

**嵌套平面不复合三维姿态。** 网格（`collectMeshes`）会一路乘 `poseMatrix`，平面只有 `perspective` 层的直接子元素才投影，再往里的先画进父平面。所以镜头不能像 `view` 那样写成一层包住整个世界的 layer，分组（一组卡片一起转）也只能在 motionflexlayer 里乘矩阵。

- 建议：可选的 `preserve-3d`（或让没有压平效果的嵌套 layer 默认不压平），平面像网格一样沿父链复合姿态，进同一次深度排序或深度缓冲；
- 改完后：`shot3d()` 可以多给一个 `world` 属性组，写在一层包住场景的 layer 上，和 `view` + `stage` 的两层结构对齐；`cam.place` 留给不想嵌套的写法。

**斜平面上的 `text-overlap`。** 判重叠用的是投影后的轴对齐外接框，卡片一斜，同一张卡片里上下两行字的外接框就压到一起。建议改用报告里已有的 `quad` 判相交。`examples/orbit` 现在在卡片上写 `expect`。

**验收。** `shot3d({ pitch: 4 })` 看一块 `rotateX: 90` 的地板，不写宽高时不报 `behind-camera`；一层 `preserve-3d` 的 layer 里放两张 `z` 不同的卡片，外层再转 `rotateY`，两张卡片的 `quad` 和直接写成 `perspective` 层子元素时一致。

## 20. `perspective` 改成多值的镜头属性（P1，新增）

**问题。** `perspective` 现在只有一个数：观众到 `z = 0` 平面的距离，灭点固定在盒子中心，机位固定正对盒子。焦距、主点、机位、朝向都是同一台镜头的属性，却只能写出第一个，剩下的要由 motionflexlayer 乘进每个物体（第 19 项）。后果是：

- 物体的 `x`、`y`、`z`、`rotateX`、`rotateY`、`rotate` 不再是它在世界里的姿态，而是“世界姿态 × 镜头”拆出来的数，作者没法直接读写；镜头一动，每个物体的属性都变；
- 拆分要靠 `origin` 绕开 `behind-camera` 的误报，报告里的 `box` 也不再是物体的世界位置；
- 离轴（主点偏移、移轴）做不了。

二维已经有对应的写法：`view="x y w h"` 把一整台二维镜头写在取景窗那层上，子元素照常用舞台坐标。三维应当一样：镜头写在 `perspective` 那层上，直接子元素写世界姿态。

**建议。** `perspective` 接受多段，写法和 `grade` 一样用逗号分段、每段一个名字。只写一个数时含义不变，现有文件不用改：

```html
<layer width="1920" height="1080" perspective="1484">                                        <!-- 现在的写法：视距 1484，机位正对盒子中心 -->
<layer width="1920" height="1080" perspective="fov 40, at 980 640 0, orbit 30 15, zoom 1.2">  <!-- 环绕机位 -->
<layer width="1920" height="1080" perspective="fov 40, at 980 640 0, from 1400 300 900">      <!-- 给出机位 -->
<layer width="1920" height="1080" perspective="1484, shift 0 -120">                           <!-- 离轴：灭点上移 120px -->
```

| 段 | 含义 | 缺省 |
| --- | --- | --- |
| 开头的数，或 `focal <px>` | 焦距，像素。即现在的视距 | 由 `fov` 算；都没写时报 `invalid-attr` |
| `fov <度>` | 竖直视角，`focal = 高 / 2 / tan(fov / 2)` | — |
| `at x y z` | 对准点，这一层局部坐标（左上角为原点，y 向下，z 朝观众），落在取景窗中心 | 盒子中心，`z = 0` |
| `orbit yaw pitch` | 机位绕对准点转，度。`yaw` 正数往右绕，`pitch` 正数从上往下看 | `0 0` |
| `roll <度>` | 镜头绕视线转，正数时画面里的内容绕对准点顺时针转，和 `shot()` 的 `rotate` 同号 | `0` |
| `zoom <k>` | 推近倍数，靠机位前后移动：机位到对准点的距离 = `focal / k` | `1` |
| `from x y z` | 机位坐标。写了就由它和 `at` 算 `orbit`、`zoom`，两者不能再写 | — |
| `shift x y` | 主点偏移，取景窗像素。灭点 = 盒子中心 + shift | `0 0` |

默认机位（只写焦距）就是现在的行为：机位在 `(宽/2, 高/2, focal)`，正对盒子。

**语义。** 设镜头的视图矩阵为 `V`（`at`、`orbit`、`roll`、`zoom` 算出），这一层的直接子元素：

- `x`、`y`、`z`、`rotateX`、`rotateY`、`rotate`、`scale`、`origin` 是世界姿态，含义和现在一样；
- 投影前先乘 `V`：平面用 `V · posePoint`，网格用 `V · poseMatrix`（嵌套层照旧沿父链乘），灭点加上 `shift`；
- 深度排序、`behind-camera`、`quad`、投影后的 `ink`、`overflow-canvas`、屏幕字号，都按乘过 `V` 之后的坐标算。顺带解决第 19 项的 `behind-camera` 口径；
- 镜头不在默认机位时，没有自己三维姿态的子元素也要走投影，不能再走二维绘制；
- 和 `view` 仍然不能写在同一层。震屏、调色写在外面的 `view` 取景窗上，三维取景窗是它的舞台。

**改动面。** 投影都经过 `posePoint`、`poseMatrix`、`planeDepth` 三个函数，镜头矩阵乘在它们前面即可：

- `layout.ts`：解析 `perspective` 的多段写法，存成焦距、`V`、`shift`；
- `perspective.ts`：从这些段算出 `V`，给上面三个函数加一个乘 `V` 的版本；
- `paint.ts` 的 `paintPerspectiveChildren`、`mesh.ts` 的 `renderMeshLayer`、`report.ts` 的平面投影和 `meshView`、`perspectiveIssues`：改用乘过 `V` 的版本，灭点加 `shift`；
- `schema.ts`、SPEC：登记新写法。`docs/proposals/3D.md` 里“不要另起 `camera`”“不做独立相机”两条要改：镜头仍然只是 `perspective` 这一个属性，不加标签；变的是它能写出完整的一台镜头。

**motionflexlayer 改完后。**

- `shot3d()` 和 `shot()` 完全对称：只算一个字符串，`cam.layer.perspective` 就是上面的多段写法；
- 物体直接用 `place()` 写世界姿态（`PlaceOptions` 加 `rotateX`、`rotateY`、`z`），`cam.place()`、`cam.pose()` 以及里面的欧拉角拆分、`origin` 分摊都删掉；
- `toScreen`、`project` 保留，给镜头外的标注和 `draw` 里的点云用，公式和 flexlayer 同一套。

**验收。**

- 只写一个数的 `perspective`，现有测试的像素和报告不变；
- `perspective="fov 40, at 980 640 0, orbit 35 18, zoom 0.8"` 下，世界姿态写的卡片，报告里的 `quad` 和 motionflexlayer 现在 `shot3d().pose()` 拆出来的结果一致（误差 0.6px 以内，`test/shot3d.spec.ts` 的同一组用例）；
- `shift 0 -120` 时，对准点落在取景窗中心上方 120px；
- 低机位（`orbit 0 4`）看一块 `rotateX="90"` 的地板，不报 `behind-camera`。

---

## 不需要 flexlayer 改的

下面这些放在 motionflexlayer 里做，flexlayer 不用管：

- 时间轴、节拍、cue、段落；
- 镜头参数（`shot()`：对准、推近、旋转、震屏、盖满；`shot3d()`：环绕机位、视角、世界姿态到层属性）、滚动、擦除、打字机这些原语；
- 多进程渲染、ffmpeg；
- 旁白合成与排期；
- 音频混音（由 visualtone 负责）；
- React 适配：motionflexlayer 用 `react-reconciler` 直接产出 `FvgNode`，`draw` 闭包原样保留，不走 `generate/react` 的字符串序列化；
- 第二版的 Vue 适配：同样用 `@vue/runtime-core` 的自定义渲染器直接产出 `FvgNode`。
