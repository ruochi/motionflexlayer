# 动效配方

每个配方都是能直接用的片段。所有片段都假定已经有了：

- `f`：帧，`f.t` 是当前秒数；
- `tl`：时间轴；
- `W`、`H`：画布尺寸；
- 已经从 `motionflexlayer` 导入了用到的函数。

对照完整示例：

- [examples/hello](../examples/hello/index.ts)：核心写法，10 秒；
- [examples/hello-react](../examples/hello-react/index.tsx)：React 写法；
- [examples/showreel](../examples/showreel/index.ts)：48 秒、六段的参考片。

## 目录

- [入场与退场](#入场与退场)
- [节拍与冲击](#节拍与冲击)
- [文字](#文字)
- [镜头](#镜头)
- [计数器与切换](#计数器与切换)
- [跟随、拖尾与预备](#跟随拖尾与预备)
- [粒子与模拟](#粒子与模拟)
- [3D 投影](#3d-投影)
- [质感：颗粒、暗角、光](#质感颗粒暗角光)
- [结构：分段与复用](#结构分段与复用)

---

## 入场与退场

**弹簧入场。** 位移、缩放、旋转用同一个弹簧值，三者同步到位。透明度单独走一段短的线性渐变，避免弹簧过冲时透明度超过 1。

```ts
const T = tl.at('title')
const e = spring(f.t - T, { damping: 14, stiffness: 160 })
place({ x: 960, y: 540 + (1 - e) * 80, rotate: (1 - e) * -6, scale: 0.9 + 0.1 * e, opacity: progress(f.t, T, T + 0.2) }, content)
```

弹簧的手感：

| 想要的感觉 | `damping` | `stiffness` |
| --- | --- | --- |
| 干脆、不弹 | 26 | 170 |
| 轻微过冲（默认附近） | 12–14 | 150–170 |
| 明显回弹 | 8 | 180 |
| 慢、重 | 16 | 80 |

**一组元素错开入场。** 从中间往两边入场，比从左到右更有张力。

```ts
items.map((item, i) => {
  const local = f.t - T - stagger(i, items.length, { each: 0.06, from: 'center' })
  const e = spring(local)
  return place({ x: 300 + i * 220, y: 540 + (1 - e) * 60, opacity: progress(local, 0, 0.15) }, item)
})
```

**退场。** 用 `in` 系缓动，越走越快地离开，时长是入场的一半到三分之二：

```ts
const out = progress(f.t, 7.8, 8.2, 'inCubic')
place({ x: 960, y: 540 - out * 40, opacity: 1 - out }, content)
```

**出现窗口。** 只想表达“这段时间在，前后淡入淡出”时，用 `fade`：

```ts
const a = fade(f.t, 2, 7.5, 0.4, 0.3)   // 2s 开始淡入 0.4s，7.5s 前 0.3s 开始淡出
place({ x, y, opacity: a }, content)   // a 约为 0 时 place 返回 null，整棵子树不进文档
```

## 节拍与冲击

**节拍脉冲。** 画面和底鼓用同一组时间。

```ts
const k = pulse(f.t, tl.times('kick'), 7)        // 每个底鼓：1 → 0，衰减系数 7
fx({ width: W, height: H }, (ctx) => {
  ctx.fillStyle = rgba('#ff5d73', 0.08 + 0.1 * k)
  ctx.fillRect(0, 0, W, H)
})
```

**冲击三件套：** 闪光、震屏、推镜，三者都由同一个包络驱动。

```ts
const hit = pulse(f.t, tl.times('impact'), 6)
const cam = shot({
  width: W, height: H,
  zoom: 1 + 0.05 * hit,
  shakeX: wiggle(f.t, 18, 14 * hit, 1),
  shakeY: wiggle(f.t, 18, 14 * hit, 2),
  rotate: wiggle(f.t, 9, 0.6 * hit, 3),
})
h('layer', { width: W, height: H, view: cam.view },
  h('layer', cam.stage,
    …scene,
    fx({ width: W, height: H }, (ctx) => glowDot(ctx, 960, 540, 600, '#ffb547', 0.35 * hit)),
  ),
)
```

想让每次冲击的强度不同，就把强度写进 cue 的 data：

```ts
tl.cue('impact', tl.bar(4), { amp: 7 }).cue('impact', tl.bar(16), { amp: 22 })
let amp = 0
for (const c of tl.cues<{ amp: number }>('impact')) if (f.t >= c.t) amp += c.data!.amp * Math.exp(-(f.t - c.t) * 4.5)
```

**冲击波环。** 每个事件放出一圈，半径随时间扩张，透明度随之衰减：

```ts
for (const t0 of tl.times('kick')) {
  const dt = f.t - t0
  if (dt < 0 || dt > 1.2) continue
  ctx.strokeStyle = rgba('#f4f1ea', 0.25 * (1 - dt / 1.2))
  ctx.beginPath()
  ctx.arc(960, 540, 120 + ease.outCubic(dt / 1.2) * 520, 0, Math.PI * 2)
  ctx.stroke()
}
```

## 文字

**蒙版擦除，叠加字距收紧。** 这是标题入场最常用的组合：

```ts
const T = tl.at('title')
const track = 70 * (1 - ease.outExpo(progress(f.t, T, T + 1.4))) + 4
place(
  { x: 960, y: 450 },
  reveal(
    { progress: progress(f.t, T, T + 0.9, 'outCubic'), width: 1500, height: 260 },
    place({ x: 750, y: 130 }, text('Flex Layer', { fontSize: 176, fontWeight: 800, letterSpacing: track, glow: '46 #ffb54755' }, 'h1')),
  ),
)
```

`reveal` 的方向可以是 `right`、`left`、`down`、`up`；`feather` 控制边缘的羽化宽度。

**逐字入场。** HTML 文字只能整段做变换，所以逐字动画放在 `draw` 里做：

```ts
fx({ width: W, height: H }, (ctx) => {
  drawGlyphs(ctx, 'motion flexlayer', {
    x: 960, y: 560, align: 'center', font: font(150, 800), color: '#f4f1ea', letterSpacing: 2,
    each: (g, n) => {
      const local = f.t - 0.4 - stagger(g.index, n, { each: 0.045, from: 'center' })
      if (local <= 0) return null
      const e = spring(local, { damping: 13, stiffness: 150 })
      return { dy: (1 - e) * 120, rotate: (1 - e) * 18, alpha: Math.min(1, local / 0.15) }
    },
  })
})
```

`each` 还可以返回 `color`、`scale`、`glow`、`glowColor`，实现逐字变色或冲击时逐字发光。

**打字机。** 没打出来的字保持透明，用来占位，所以居中排版不会随着打字左右漂移：

```ts
const CODE: Token[] = [['spring', '#4fd1ff'], ['(t - ', '#f4f1ea'], ["tl.at('impact')", '#ffb547'], [')', '#f4f1ea']]
tl.cue('type', Array.from({ length: tokenLength(CODE) }, (_, i) => 5 + i * 0.045))   // 音频在每个字上放 tick
place({ x: 960, y: 840 }, typewriter(CODE, (f.t - 5) / 0.045 + 1, { fontSize: 36 }))
```

**光标闪烁。** 用硬切换，而不是渐变。打字期间光标常亮，停下来以后才开始闪：

```ts
const typing = f.t < typeEnd
const on = typing || (f.t * 1.8) % 1 < 0.5
```

**定格感。** `steps(n)` 把连续的进度变成 n 级台阶，适合手绘、定格动画的感觉：`progress(f.t, 0, 1, steps(8))`。

## 镜头

镜头是两层 layer：外层是取景窗，`width`、`height` 是它在成片上的大小，`view="x y w h"` 是从舞台上取的那一块；里层是舞台，内容照常用舞台坐标摆放。`shot()` 只负责算数，结构自己写：

```ts
const cam = shot({ width: W, height: H, x: 1160, y: 575, zoom: z })
h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, …scene))
```

- 窗外裁掉，不报 `overflow-canvas`；字号按屏幕上的大小查，远景里的小字推近后就不再报 `min-font-size`；
- `view` 没被舞台盖满时报 `view-outside`。`shot()` 默认把 `zoom` 抬到刚好盖满（震屏、旋转、对准边缘时），`cover: false` 关掉；
- 章节、字幕、标注写在取景窗外面，用成片像素；
- 调色、暗角写在取景窗那层上，是镜头的滤镜；写在舞台里，是场景里的光。

**推镜到任意点。** `(x, y)` 是舞台上要对准的点，落在取景窗中心：

```ts
const z = Math.exp(Math.log(16) * progress(f.t, 30.5, 32, 'inOutCubic'))   // 按指数缩放，速度感才均匀
const cam = shot({ width: W, height: H, x: 1160, y: 575, zoom: z })
```

如果要让目标点在缩放的同时从原位滑到画面中心，令 `x = 目标 + (中心 - 屏幕位置) / zoom`。showreel 的 `layoutScene` 就是这样写的。

**推向排版算出的一点。** 目标点不必手填：先用 `canvas.create` 量一遍整页，把要看的字包一层 `<span id="here">`，`text[].lines[].chars` 里带这个 `id` 的字就是它，格子中心就是 `shot` 的 `x`、`y`。改了正文、换了栏宽，镜头还是对准那几个字。要在窗外画框标出它，用 `cam.toScreen(x, y)` 换成成片像素，盒子的宽高乘 `cam.zoom`。见 `examples/ink/page.ts`。

**按对数插值缩放。** 从 15 倍拉到 1 倍再推到 5 倍，`zoom` 直接线性插值时，放大的那一头会一闪而过。对 `log(zoom)` 插值，画面里的运动速度才是匀的：

```ts
const logZ = lerp(Math.log(z0), Math.log(z1), progress(f.t, a, b, 'inOutCubic'))
const cam = shot({ width: W, height: H, x, y, zoom: Math.exp(logZ) })
```

**镜头歪一下。** `rotate` 转的是舞台，绕对准的点转，取景窗本身不转，画面边缘仍是水平的。要歪的是画框（比如画中画的小窗），在取景窗那层上写 `rotate`。

**绕任意点转一组内容。** `place` 的 `origin` 也接受任意点。卡片绕自己的左下角倒下：`place({ x, y, width: 400, height: 300, origin: 'bottom-left', rotate })`；绕卡片外的一点公转：`origin: [200, 900]`。

**常驻的缓慢推进。** 整段 0 → 6% 的推进，让画面一直有呼吸感：

```ts
const cam = shot({ width: W, height: H, zoom: 1 + 0.06 * progress(f.t, 0, 8, 'inOutSine') })
```

**镜头分层。** 外层取景窗负责震动，舞台里再开一个取景窗负责推拉；HUD 放在两层外面：

```ts
const framed = (cam: Shot, ...kids: Child[]) => h('layer', { width: W, height: H, view: cam.view }, h('layer', cam.stage, ...kids))
return [
  framed(shot({ width: W, height: H, shakeX, shakeY }), background, framed(shot({ width: W, height: H, x, y, zoom }), cards)),
  hud,
  fx({ width: W, height: H, name: 'post' }, grainAndVignette),
]
```

**画中画：一个舞台，几个窗口。** 舞台排一次，放进几个取景窗，各取一块。小窗的位置、大小可以做动画，长到全屏就是转场：

```ts
const stage = canvas.create(h('layer', { width: W, height: H }, …scene))   // 量一次，结果可以放进多个窗口
const wide = shot({ width: W, height: H })
const close = shot({ width: 640, height: 360, x: 1400, y: 300, zoom: 3 })
return [
  h('layer', { width: W, height: H, view: wide.view }, stage),
  h('layer', { x: 1200, y: 640, width: 640, height: 360, view: close.view, rotate: -2 }, stage),
]
```

## 计数器与切换

**滚动计数。** 每个事件弹一格，滚动带过冲，而不是瞬间跳到下一个数：

```ts
const value = springSteps(f.t, tl.times('kick'), { damping: 14, stiffness: 220 })
roll({ value, cell: 80, size: 120, align: 'end' }, Array.from({ length: 17 }, (_, i) => text(String(i).padStart(2, '0'), { fontSize: 64 })))
```

**标签切换。** 和计数器是同一个写法：每段一个标签，窗口高度等于一行：

```ts
roll({ value: springSteps(f.t, tl.sections.slice(1).map((s) => s.from)), cell: 34, size: 360 }, tl.sections.map((s) => text(s.name, { fontSize: 22 })))
```

**数值滚动。** 数字本身从 a 滚到 b：

```ts
const v = Math.round(tween(f.t, 2, 4, 0, 54587, 'outExpo'))
text(v.toLocaleString('en-US'), { fontSize: 72, fontWeight: 800 })
```

## 跟随、拖尾与预备

**跟随（follow-through）。** 同一个形状画好几层，每层晚 70ms，尺寸逐层缩小：

```ts
const LAG = 0.07
for (let j = 0; j < 4; j++) {
  const e = spring(f.t - T - j * LAG, { damping: 11, stiffness: 150 })
  drawShape(ctx, lerp(fromSides, toSides, e), [1, 0.74, 0.5, 0.28][j]!)
}
```

**预备（anticipation）。** 爆开之前先收缩、反转。这段蓄势和音频里的 riser 对齐：

```ts
const windup = progress(f.t, 15.5, 16, 'inCubic')      // 0 → 1，在冲击那一刻到顶
const scale = 1 - 0.25 * windup
const spin = -windup * 40                               // 先反着转
```

**拖尾。** 不要逐帧累积。用解析式或预计算的轨迹，在 `draw` 里往回采样几个过去的时间点：

```ts
ctx.beginPath()
for (let k = 0; k <= 8; k++) {
  const [x, y] = positionAt(i, f.t - k * 0.012)       // 位置是 t 的纯函数
  k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
}
ctx.stroke()
```

## 粒子与模拟

**规则：** 模拟必须在 `setup` 里按固定频率预先积分好，帧函数里只查表插值。这样每一帧都能独立计算，多进程渲染的结果和逐帧渲染一致。

```ts
const N = 2400, HZ = 120, STEPS = 8 * HZ
const table = new Float32Array((STEPS + 1) * N * 2)

function setupSim() {
  const r = rng(2024)
  const pos = new Float32Array(N * 2).map(() => r() * 1000)
  for (let s = 1; s <= STEPS; s++) {
    for (let i = 0; i < N; i++) {
      const [vx, vy] = curl2(pos[i * 2]! * 0.002, pos[i * 2 + 1]! * 0.002, s / HZ * 0.13)
      pos[i * 2]! += vx * 95 / HZ
      pos[i * 2 + 1]! += vy * 95 / HZ
    }
    table.set(pos, s * N * 2)
  }
}

function particleAt(i: number, t: number): [number, number] {
  const fr = clamp(t * HZ, 0, STEPS), a = Math.floor(fr), b = Math.min(STEPS, a + 1), k = fr - a
  const ia = (a * N + i) * 2, ib = (b * N + i) * 2
  return [lerp(table[ia]!, table[ib]!, k), lerp(table[ia + 1]!, table[ib + 1]!, k)]
}

defineComposition({ …, setup: setupSim, render: … })
```

**粒子聚成文字。** 在 `setup` 里把文字采样成目标点，再把粒子和目标都按 x 排序后一一配对。这样聚合时粒子从左到右扫过去，不会交叉乱飞：

```ts
const targets = sampleTextPoints('<draw>', { font: font(300, 800), width: W, height: H, step: 3 })
```

聚合时，粒子沿“当前位置 → 目标”的方向前进，同时在法线方向加一段 `sin(π·e)` 的弧，路径看起来像被吸进去。具体写法见 showreel 的 `particles.ts`。

## 3D 投影

在 2D canvas 里做点云：先旋转，再做透视除法，最后按深度排序，远处的点更暗、更小。

```ts
const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch)
const proj = points.map(([x, y, z]) => {
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy
  const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx
  const s = 900 / (900 + z2)
  return { x: 960 + x1 * s, y: 540 + y2 * s, s, z: z2 }
}).sort((a, b) => b.z - a.z)
for (const p of proj) glowDot(ctx, p.x, p.y, 3 * p.s, '#4fd1ff', clamp(p.s - 0.4))
```

形状之间的过渡（球、环面、三叶结），就是对两组点的坐标做 lerp，用 `spring` 驱动插值系数。

## 质感：颗粒、暗角、光

**最后一层 post。** 放在返回数组的最后，不放进取景窗：

```ts
const noiseTile = createCanvas(256, 256)   // 模块顶层建一次
fx({ width: W, height: H, name: 'post' }, (ctx) => {
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
  // 颗粒：每帧换一个偏移，平铺噪声贴图
  const ox = Math.floor(hash(f.frame) * 256), oy = Math.floor(hash(f.frame, 1) * 256)
  ctx.globalAlpha = 0.05
  for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) ctx.drawImage(noiseTile as never, x, y)
})
```

**发光线条。** 用 `strokeGlow(ctx, path, { color, width, glow })`：先画一遍带 `shadowBlur` 的宽线，再画实线。不要用 `lighter` 混合叠很多短线段，那样会出现一串串珠子似的亮点。

**扫光（glint）。** 用一条窄的斜向线性渐变，从左到右扫过标题，持续 0.5 秒左右，同时配一个 sparkle 音效。

## 结构：分段与复用

**按段落写函数。** 每段一个函数，函数内部用相对时间：

```ts
function geometry(f: Frame) {
  const s = tl.sectionNamed('geometry')
  if (f.t < s.from - 0.5 || f.t > s.to + 0.5) return null   // 段外直接跳过
  const local = f.t - s.from
  …
}
```

**React 里用 `<Sequence>`。** 组件从 0 秒开始写，再摆到时间轴上，见 [REACT.md](REACT.md)。

**无缝循环。** 循环片段要求第 0 帧和最后一帧完全相同：所有周期运动的周期都要能整除时长，用 `oscillate(t, duration / k)`；噪声用圆周采样，`simplex3(cos(2πt/T) * r, sin(2πt/T) * r, seed)`。
