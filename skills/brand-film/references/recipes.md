# 手法

片段都按 motionflexlayer 来写。`f.t` 是秒，`tl` 是时间轴。更通用的弹簧、镜头、粒子在 [docs/RECIPES.md](../../../docs/RECIPES.md)。这里只收品牌片里反复要用、又容易做成同一种淡入的那些。

同类的东西不要连续用同一种。

## 蒙版擦除

标题从一条窄窗口里长出来。透明度另走，弹簧过冲时不要让字超过不透明。

```ts
const p = progress(f.t, tl.at('headline'), tl.at('headline') + 0.5, 'outCubic')
place(
  { x: 150, y: 300, anchor: 'left' },
  reveal({ progress: p, width: 760, height: 140 }, place({ x: 380, y: 70 }, text('标题', { fontSize: 104, fontWeight: 800 }))),
)
```

## 逐字打出

整行宽度从第一帧就定死，居中不会跟着打字左右漂。

```ts
const shown = (f.t - tl.at('type')) / 0.06
place({ x: 150, y: 470, anchor: 'left' }, typewriter('主按钮偏右 12 像素', shown, { fontSize: 36 }))
```

打字的嘀嗒用同一串时间，不要另起一串。

## 数字落到目标

和按钮共用一个弹簧，数字和位置一起到。

```ts
const e = spring(f.t - tl.at('snap'), { damping: 14, stiffness: 180 })
const n = Math.max(0, Math.round(12 * (1 - e)))
text(String(n), { fontSize: 96, fontWeight: 800, color: LINE })
```

## 砸上

短、硬、过冲。后面跟 `shot()` 的一点点抖动。不要用半秒的 `inOut`。

```ts
const ox = t < at ? 64 : 64 * (1 - spring(t - at, { damping: 11, stiffness: 170 }))
const hit = pulse(f.t, [at], 7)
shot({ width: W, height: H, shakeX: wiggle(f.t, 21, 10 * hit, 2) })
```

抖动是屏幕像素，字要离安全区够远，抖的时候不报 `outside-safe`。

## 长条

从一端长出来。状态字等长条到了再出现，避免两个字叠在一起。

```ts
const bar = progress(f.t, at, at + 0.3, 'outCubic')
h('rect', { x: 0, y: 0, width: Math.max(2, 520 * bar), height: 18, rx: 9, fill: INK })
```

## 描线

`line` 的终点跟着进度走。线不要画进字里，终点停在字或按钮的前面。

```ts
const x2 = 200 + progress(f.t, tl.at('line'), tl.at('line') + 0.65, 'inOutCubic') * 760
h('line', { x1: 200, y1: y, x2: Math.min(x2, stopBeforeText), y2: y, stroke: LINE, 'stroke-width': 6 })
```

## 弹出

圆点、状态点。缩放下限不要把旁边的字带到 24px 以下。没有字的形状可以缩得更小。

```ts
const e = spring(f.t - tl.at('send'), { damping: 9, stiffness: 220 })
place({ x, y, scale: 0.92 + 0.08 * Math.min(1, Math.max(0, e)), opacity: e > 0.02 ? 1 : 0 }, dot)
```

## 从一侧进来

位移控制在还没出画、字还在安全区里的范围。要出画就先把透明度收到 0，`place` 会把整棵子树拿掉。

```ts
const e = spring(f.t - at, { damping: 15, stiffness: 150 })
const dx = (1 - Math.min(1, Math.max(0, e))) * 56
```

## 转场

**交接。** 上一段的购买页留着，缩到下一段的一个角上，新的内容在旁边长出来。这是最强的一种。

**横甩。** 整段的 `x` 在最后 0.3 秒用 `inCubic` 挪一小段，同时透明度收到 0。下一段用 `outExpo` 从另一侧进入。挪出画面之前就必须消失，否则 `check` 会报出画，停在半截上也会像摆错。

**穿入。** `shot()` 的 zoom 在这一段推上去，下一段从略小于 1 的倍数回到 1。推和拉不要接成同一次连续的缩放，段界上可以切。

**收到一点。** 几个物件向同一个点移动，在它们的字叠上之前透明度到 0，下一段从那个点长出来。

全片的拉远只放在落幅：zoom 从略大于 1 回到 1。前面的段用推、跟、横移。
