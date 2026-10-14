---
name: brand-film
description: >
  用 motionflexlayer 做一支 10–60 秒的品牌片或产品短片，默认 15 秒。
  先写分镜和文案出处，再写画面；用计划闸门和画面闸门卡住半成品；配乐最后写，节拍跟着切点走。
  用户要品牌宣传片、广告片、产品短片、发布会开场、logo 动画，或说片子太像模板、太简单、没有产品时使用。
---

# 用代码做品牌片

给模型的入口。普通动画先读仓库根上的 [MOTION.md](../../MOTION.md)。这一份只处理品牌片：一支要能看懂产品在干什么的短片，而不是一支好看的循环动画。

画面仍是 `t → 一帧`，声音仍走同一条时间轴。这里多出来的是创作顺序，和两道过不了就不能交付的闸门。

三件事决定能不能交：

1. 先读下面这张表里的文件，再看 [examples/brand](../../examples/brand/index.ts)。只读这一页，会做出一支能通过检查、但什么都没讲的片子。
2. 先写 `shot-list.md`、`copy.md`、`assets.md`，放在合成入口旁边，然后再写时间轴。
3. 计划闸门和画面闸门都要打印 `0 failed`。`check` 没有 error。配乐在这之后才写。

下限是下限。为了让数字好看而多加几个没有内容的 cue，片子仍然是空的。对着参考片看，不要对着数字凑。

## 先读

| 时机 | 文件 |
| --- | --- |
| 动笔之前 | [references/creative.md](references/creative.md) |
| 摆位之前 | [references/layout.md](references/layout.md) |
| 找素材时 | [references/assets.md](references/assets.md) |
| 写完想知道够不够 | [references/quality-bar.md](references/quality-bar.md) |
| 写代码之前 | [references/shot-list.md](references/shot-list.md) |
| 写画面时 | [references/recipes.md](references/recipes.md) |
| 写配乐时 | [references/scoring.md](references/scoring.md) |
| 对照 | [examples/brand](../../examples/brand/index.ts) |

参考片「校线」是虚构产品。它演示的是顺序和完成度，不是配色和版式。新片子换掉它的冷纸底和红线。

## 步骤

1. **把来源写下来。** 一句话卖点、三到五个具体行为、必须出现的句子、不能说的话。真实品牌按 [assets.md](references/assets.md) 去找现在用的标记和画面，写进 `assets.md`。找不到就标明缺了什么，不要画一个圆代替。
2. **用一个带动作的句子写出隐喻。** 隐喻决定镜头和转场。段 2 到段 4 里要看见产品自己的界面在干活。只有动词、没有产品，是另一支被退回的片子。
3. **写分镜和文案。** 用 [shot-list.md](references/shot-list.md) 的结构。每一段至少五个时刻、一个镜头、一个转场、前中后三层、一句画面文字的出处。自检没勾完，不要开始写 `render`。
4. **再写时间轴。** 段界和 cue 用分镜里的秒。有旁白就先念，时长听旁白的；没有旁白，节拍听画面里重复的那一下，不要先挑一首曲子再把画面塞进去。
5. **按段写画面。** 手法从 [recipes.md](references/recipes.md) 里拿，同一类元素不要连续用同一种入场。镜头用 `shot()`，字和按钮不要跟着镜头一起抖。
6. **计划闸门。** `npm run mfl -- brand <入口>`。分镜、文案、素材和时间轴有一项没写完，它不会打印 `0 failed`。
7. **排版。** `npm run mfl -- check <入口>`。error 要修。warn 对照 MOTION.md 的问题码表，该修的修，故意的写 `expect`。
8. **画面闸门。** `npm run mfl -- frames <入口>`。它量覆盖、边缘、运动和静止。失败就去加产品，不要把底纹调浓来凑覆盖率。然后 `stills --cues`，把联系表和参考片并排看。
9. **最后才写配乐。** 见 [scoring.md](references/scoring.md)。鼓要在中间拿掉一次，最后一下落在正拍上。模型听不见，交付时写报告里的数字，不要写「好听」。
10. **交付时写明你核过什么。** 两道闸门的 `0 failed`、`check`、响度，以及联系表和参考片比过没有。口味和声音好不好听，留给看的人。

## 命令

```bash
npm run mfl -- brand  examples/brand/index.ts
npm run mfl -- stills examples/brand/index.ts --cues
npm run mfl -- check  examples/brand/index.ts
npm run mfl -- frames examples/brand/index.ts
npm run mfl -- audio  examples/brand/index.ts
npm run mfl -- render examples/brand/index.ts --scale 0.5 --fps 30
```

`brand` 读入口旁边的 `shot-list.md`、`copy.md`、`assets.md`。`frames` 默认每 0.2 秒一帧、0.2 倍分辨率。

## 硬规矩

这些都是半成品片子里反复出现的问题。

- 先有分镜，再有代码。
- 段 2 到段 4 要看见产品在干活：界面、结果、设备、真实的数据。光、粒子、一滴墨、一粒种子，如果里面没有产品，什么都能套。
- 画面要有前、中、后。一行字加一个小形状，是空的。
- 画面上的句子要能指回来源。编的句子在交付里标明。
- 标记用对方现在的文件。只在落幅出现，不要做成角落台标。
- 不要页码、进度条、四角章节名。那是幻灯片。
- 全片只拉远一次。拉远读作「结束了」。
- 转场不要只靠透明度交叉淡化。交接、横甩、穿入、收到一点，至少用两种。
- 强调色是高光，不是底。不要米色加橙粉，也不要把示例的冷纸底原样搬过去。
- 标题在 1080p 上大约 72–120px。30px 的一行字没有人读。
- 时间用秒，帧函数是纯函数。`Math.random()` 会在多进程渲染里闪。
- 配乐和切点用同一组 cue。没有声音的品牌片不算交片。
- 字不要被卡片、线、标记盖住。线停在字前面。
