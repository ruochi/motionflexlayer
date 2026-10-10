# React 写法

用 React 组件写帧函数。适合由很多小块组成、需要复用和组合的画面：数据可视化、UI 演示、字幕条、片头模板。仓库里的片子 `examples/ink` 用的是核心写法；React 写法看下面的最小例子。

React 写法和核心写法得到的是同一种东西：一棵 flexlayer 节点树。两种写法可以混用。

## 配置

```bash
npm i react@^19.3 react-reconciler@^0.34
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "motionflexlayer/react"
  }
}
```

`jsxImportSource` 指向 `motionflexlayer/react`，这样小写标签（`<layer>`、`<fx>`、`<div>`、`<p>` …）会按 flexlayer 元素做类型检查，而不是按 DOM 元素。

## 最小例子

```tsx
import { defineComposition, spring, timeline } from 'motionflexlayer'
import { Place, Text, fromReact, useFrame } from 'motionflexlayer/react'
import { LOOK } from './look.js'   // 这支片子自己的色板和字级

const tl = timeline({ bpm: 120, duration: 4 })

function Title() {
  const { t } = useFrame()
  const e = spring(t - 0.3)
  return (
    <Place x={960} y={540 + (1 - e) * 60} opacity={Math.min(1, (t - 0.3) / 0.2)}>
      <Text as="h1" style={LOOK.title}>Hello</Text>
    </Place>
  )
}

export default defineComposition({
  id: 'title', width: 1920, height: 1080, fps: 60, duration: 4,
  background: LOOK.bg, color: LOOK.ink, timeline: tl,
  render: fromReact(<Title />),
})
```

## 每帧都是全新挂载

这是 React 写法里最重要的一条规则。

`fromReact` 每一帧都新建一个 React 根节点，同步渲染，转换成 flexlayer 节点树，然后卸载。帧与帧之间**不保留任何 React 状态**。这样每一帧都只由 `t` 决定，多进程渲染、跳到任意时刻渲染，结果都一样。

| 可以用 | 用法 |
| --- | --- |
| `useFrame()`、`useTime()`、`useTimeline()` | 读当前帧，所有动画都从这里推出来 |
| `useContext` / `createContext` | 主题、调色板、布局参数往下传 |
| `useMemo` | 只在一帧内去重：同一帧里多个子组件共用一个计算结果 |

| 没有意义 | 原因 | 改成 |
| --- | --- | --- |
| `useState` | 下一帧是新挂载，状态回到初始值 | 用 `t` 算出来 |
| `useEffect` / `useLayoutEffect` | 渲染完就卸载，副作用来不及有意义 | 预计算放进 `setup` 或模块顶层 |
| `useRef` 存上一帧的值 | 同上 | 需要历史时，在 `setup` 里预先模拟好，按 `t` 查表 |
| 事件处理（`onClick` …） | 视频没有交互 | 直接删掉；传函数类型的 prop 会报错 |

跨帧共享的重计算（随机数据、粒子模拟、文字采样）放在模块顶层，或放进 `defineComposition({ setup })`。不要放在 `useMemo` 里：`useMemo` 每帧都会重新计算一遍。

## 时间：`useFrame` 与 `<Sequence>`

```ts
const { t, frame, fps, width, height, duration, progress, tl, beat, section, globalT, from } = useFrame()
```

`<Sequence from={2} duration={3}>` 只在全片 2–5 秒内渲染子树。子树里的 `t` 从 0 开始，`progress` 是片段内的 0 → 1，`globalT` 仍然是全片时间。

```tsx
<Sequence from={tl.at('title')}>
  <Title />            {/* Title 里按 t = 0 开始写 */}
</Sequence>
<Sequence from={tl.sectionNamed('outro').from} duration={2}>
  <Credits />
</Sequence>
```

`Sequence` 可以嵌套，内层的 `from` 相对外层。

注意：在 `<Sequence>` 里，`useFrame().t` 是局部时间，但 `tl.at('kick')`、`tl.times(...)` 返回的仍然是全片时间。要拿时间轴上的 cue 去和时间比较时，用 `globalT`：

```ts
const { globalT, tl } = useFrame()
const k = pulse(globalT, tl.times('kick'))
```

## 组件

每个组件都对应一个核心 API，参数也相同。

| 组件 | 对应核心 API | 说明 |
| --- | --- | --- |
| `<Place x y anchor opacity rotate scale origin width height>` | `place()` | 定位和变换。`opacity` ≤ 0.002 时整个子树不渲染 |
| `<Fx draw={(ctx, el) => …} x y width height name>` | `fx()` | canvas 绘制。默认铺满整个画布 |
| `<Reveal progress width height direction feather>` | `reveal()` | 蒙版擦除 |
| `<Roll value cell size axis align items={[…]}>` | `roll()` | 滚动窗口。`items` 用数组 prop 传，不用 children |
| `<Text style as>` | `text()` | 单行文字，不换行 |
| `<Box style>` | `box()` | flex 容器 |
| `<Raw node={…}>` | — | 原样插入核心 API 生成的节点 |

镜头没有组件：直接写取景窗和舞台两层 `<layer>`，参数用核心的 `shot()` 算。取景窗多大、放在哪、几个窗口取同一个舞台，都在 JSX 里看得见：

```tsx
const cam = shot({ width: 1920, height: 1080, x, y, zoom, shakeX })
<layer width={1920} height={1080} view={cam.view}>
  <layer {...cam.stage}>{scene}</layer>
</layer>
```

`style` 可以是字符串，也可以是对象。对象的键用驼峰写法，数字会自动加 `px`。`opacity`、`fontWeight`、`lineHeight`、`zIndex`、`flex*`、`order` 这几个不加单位。

## `draw` 闭包

`draw={fn}` 会原样保留到 flexlayer 节点上，不会被序列化。所以闭包可以直接用组件里的变量：

```tsx
function Bars({ values }: { values: number[] }) {
  const { t, tl } = useFrame()
  return (
    <Fx width={1600} height={560} draw={(ctx, el) => {
      values.forEach((v, i) => {
        const g = spring(t - tl.times('bar')[i]!)
        ctx.fillRect(i * 100, el.h - v * g, 80, v * g)
      })
    }} />
  )
}
```

`el` 是 flexlayer 排版后这个元素的盒子（`el.w`、`el.h`），所以 flex 布局决定了大小，`draw` 按实际大小去画。

## 和核心 API 混用

核心 API 里有一部分没有对应的组件，比如 `typewriter()`、`h()` 手写的节点。这些可以用 `<Raw>` 插进 React 树：

```tsx
<Place x={960} y={840}>
  <Raw node={typewriter(CODE, (t - 5) / 0.045 + 1, { fontSize: 36 })} />
</Place>
```

反过来也可以：`fromReact(<X />)` 返回一个帧函数，结果是 `FvgChild[]`。可以把它当成核心写法里的一层：

```ts
const overlay = fromReact(<LowerThird />)
render: (f) => [background(f), ...overlay(f), post(f)]
```

## 小写标签和类型

小写标签就是 flexlayer 的元素：`layer`、`fx`（也可以用任意自定义名字，例如 `<bars draw={…}>`，它在报告里更容易认出来）、`div`、`p`、`h1`、`span`、`rect`、`circle`、`path`、`mask`、`font` 等。属性名和 flexlayer markup 相同，例如 `x`、`y`、`anchor`、`origin`、`overflow`、`glow`。类型定义在 `src/react/jsx.ts`。

属性值的转换规则：

- `true` 转成字符串 `'true'`；
- `false`、`null`、`undefined` 会被丢掉；
- 数字转成字符串（和 flexlayer 的 `h()` 一样）；
- `style` 对象经过 `css()` 转成字符串；
- 函数只允许出现在 `draw` 上，其他函数类型的 prop 会直接报错。

## 性能

React 协调加上转换，每帧额外多几毫秒。和 PNG 编码、绘制比起来可以忽略。

## Vue（v2 计划）

Vue 适配放在 v2，思路和 React 相同：

- 用 `@vue/runtime-core` 的 `createRenderer` 写一个自定义渲染器，宿主节点就是 flexlayer 的 `FvgNode`；
- 每帧 `createApp(Scene).mount(root)`，转换后 `unmount`，同样不保留跨帧状态；
- `useFrame()` 用 `inject` 实现，`<Sequence>` 用 `provide` 覆盖局部时间；
- `draw` 用 prop 传函数，渲染器在 `patchProp` 里原样挂到节点上；
- 组件名和参数与 React 版一致：`Place`、`Fx`、`Reveal`、`Roll`、`Text`、`Box`、`Raw`、`Sequence`。
