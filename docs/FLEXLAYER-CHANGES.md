# flexlayer 改动方案（给 motionflexlayer 用）

本文列出 motionflexlayer 需要 flexlayer 配合的改动。每一项写清楚：现在的问题、建议的接口、motionflexlayer 里目前的临时做法（改完后删掉哪段代码）、验收方法。

motionflexlayer 现在**不依赖任何一项**就能跑：每项都有临时做法。改完一项，motionflexlayer 删一段绕路代码。

优先级：

- **P0**：打包和公共接口。不改的话，motionflexlayer 发布不了，只能本地 `file:../flexlayer` 联调。第 8 项也列为 P0：它的临时做法依赖 flexlayer 的内部实现，flexlayer 一改就可能失效。
- **P1**：动画质量和性能。现在靠绕路实现，代价是代码复杂或渲染变慢。
- **P2**：锦上添花。

| # | 优先级 | 改动 | motionflexlayer 里受影响的代码 |
| --- | --- | --- | --- |
| 1 | P0 | 打包：`prepare` + `files` | `package.json` 依赖写法 |
| 2 | P0 | 导出字体与 canvas | `src/canvas.ts` 整个文件 |
| 3 | P0 | `draw` 的 ctx 类型补全 | `src/render/stills.ts` 里 `drawImage` 的强转 |
| 4 | P1 | 动画用的检查配置：`bleed`、视频字号阈值 | 示例里的 `lint.ignore` |
| 5 | P1 | `origin` 支持任意点 | `src/nodes.ts` 的 `camera()` |
| 6 | P1 | 离屏画布按可见区域裁剪 | `MOTION.md` 里“镜头里别放 blur / mask”这条规则 |
| 7 | P1 | 行内 `span` 的变换与透明度 | `src/drawkit.ts` 的 `drawGlyphs`（保留，但标题类不再需要） |
| 8 | P0 | 原始像素输出（PNG 编码占单帧 80–95%） | `src/render/raw.ts` 整个文件（拦截 `toBuffer` 的垫片） |
| 9 | P1 | 成组透明度 | 无（现在没有绕路，只能接受瑕疵） |
| 10 | P2 | `draw` 里查询其它元素的盒子 | 示例里手算的坐标 |
| 11 | P2 | 秒为单位的 `spring` | 无（motionflexlayer 自带） |
| 12 | P2 | 层效果：`bloom`、`chroma` | 示例里在 draw 里手画的光晕 |

---

## 1. 打包：`prepare` + `files`（P0）

**问题。** `package.json` 的 `main` 指向 `dist/`，但 `dist` 在 `.gitignore` 里。也没有 `files` 字段，npm 打包时就按 `.gitignore` 把 `dist` 排除。结果是：

- `npm install github:ruochi/flexlayer` 装下来没有 `dist`，导入直接失败；
- `npm install --install-links ../flexlayer` 同样拿不到 `dist`。

**建议。**

```json
{
  "files": ["dist", "SPEC.md", "AGENTS.md", "docs"],
  "scripts": {
    "prepare": "npm run build"
  }
}
```

npm 安装 git 依赖时会执行 `prepare`，自动构建。

**motionflexlayer 改完后。** 依赖从 `"@dc/flexlayer": "file:../flexlayer"` 改成 `"github:ruochi/flexlayer#<tag>"`，或者等 flexlayer 发布到 npm 后改成版本号。

**验收。** 在一个空目录里执行 `npm i github:ruochi/flexlayer`，然后 `node -e "import('@dc/flexlayer').then(m => console.log(typeof m.renderFvg))"` 输出 `function`。

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
<layer bleed cx="960" cy="540" width="3840" height="2160" scale="2.4">…</layer>
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

## 5. `origin` 支持任意点（P1）

**问题。** `origin` 只有九宫格。绕任意点缩放（推镜到某张卡片、从按钮处放大）时，只能用一个 2W×2H 的包裹层，把目标点移到包裹层中心：

```ts
// motionflexlayer 现在的 camera()：两层 layer
h('layer', { cx: W / 2, cy: H / 2, width: W * 2, height: H * 2, scale: zoom },
  h('layer', { cx: W - x, cy: H - y, anchor: 'top-left', width: W, height: H }, ...children))
```

这种写法能用，但不直观，而且模型自己写的时候很容易把偏移量算错。

**建议。** `origin` 接受两个数，或者百分比：

```html
<layer width="1920" height="1080" origin="1160 575" scale="4">…</layer>
<layer width="400" height="300" origin="25% 80%" rotate="-8">…</layer>
```

数字是 layer 自身坐标系里的位置。九宫格写法保留。

**motionflexlayer 改完后。** `camera()` 变成一层：`h('layer', { cx, cy, width: W, height: H, origin: \`${x} ${y}\`, scale, rotate, bleed })`。

**验收。** `origin="1160 575" scale="2"` 渲染出来，(1160, 575) 处的像素在缩放前后保持不动。

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

## 8. 原始像素输出（P0，性能）

**问题。** `renderFvg` 每帧都会把画布编码成 PNG（`paint.ts` 末尾的 `canvas.toBuffer('image/png')`）。视频管线不需要 PNG，ffmpeg 收到以后还得再解码一次。实测 1080p 下：

| showreel 的帧 | 单帧总耗时 | 其中 PNG 编码 |
| --- | --- | --- |
| 16.4s（粒子爆开） | 315ms | 301ms |
| 33s（3D 点云） | 388ms | 309ms |
| 42.5s（落款） | 290ms | 272ms |

同一张画布：`toBuffer('image/png')` 约 304ms，`data()` 取原始像素 0.7ms，`toBuffer('image/jpeg', 95)` 约 9ms。**PNG 编码占单帧耗时的 80–95%，绘制本身只占几十毫秒。**

**建议。**

```ts
const { pixels, width, height, report } = await renderFvg(node, { t, format: 'rgba' })
// pixels: Buffer，长度 width × height × 4；写明是否预乘 alpha
```

**motionflexlayer 里的临时做法。** `src/render/raw.ts` 在渲染期间改写 `@napi-rs/canvas` 画布原型上的 `toBuffer`，拦截 `'image/png'` 调用，返回空 Buffer，同时用 `this.data()` 取走像素。worker 再以 `-f rawvideo -pix_fmt rgba` 喂给 ffmpeg。这个做法依赖 flexlayer 内部的实现细节，改完后删除 `raw.ts`。

实测同一批 16 帧，在同一进程里交替渲染：PNG 方式 605ms/帧，原始像素 52ms/帧，快 11.6 倍。这次测量时机器负载很高，绝对值偏大，比例可信。两种管线渲出的 showreel 逐帧 PSNR 为 inf，即像素完全一致。showreel 全片（2880 帧，7 个进程）从 300 秒降到 90 秒。

**之后可以做的。** 运动模糊：每帧渲染 N 个子帧，在 JS 里平均。现在每个子帧都要编码一次 PNG，代价太高，做不了。

**验收。** `format: 'rgba'` 的输出和 PNG 解码后的像素一致；单帧耗时不再包含编码。

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

---

## 不需要 flexlayer 改的

下面这些放在 motionflexlayer 里做，flexlayer 不用管：

- 时间轴、节拍、cue、段落；
- 镜头、震屏、滚动、擦除、打字机这些原语；
- 多进程渲染、ffmpeg、音频混音；
- React 适配：motionflexlayer 用 `react-reconciler` 直接产出 `FvgNode`，`draw` 闭包原样保留，不走 `generate/react` 的字符串序列化；
- 第二版的 Vue 适配：同样用 `@vue/runtime-core` 的自定义渲染器直接产出 `FvgNode`。
