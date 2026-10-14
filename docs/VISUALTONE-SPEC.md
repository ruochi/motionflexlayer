# visualtone 乐谱规范提案（让 AI 写音乐和音效）

本文是给 visualtone 的格式提案，目标只有一个：**让模型一次写出能听的配乐和音效，写错了能从报告里知道错在哪。** 音色好不好听是引擎的事，可以慢慢换；格式一旦定下来，模型、示例、motionflexlayer 都会按它写，所以格式要先想清楚。

对照的是 visualtone 0.3.0（`16903b3`，轻量引擎，乐谱 v1）。v1 的方向是对的：普通音符列表、音名、乐器预设名、zod 校验、同一份乐谱同一个结果、`instruments` / `processTrack` / `processMaster` 扩展口。下面只写在它之上要改什么。

## 状态

**核对于 visualtone 0.4.1（`cd635b8`，乐谱 v2）。** 格式部分基本按本文实现：`tempo`、`key`（也收 `"Em"`、`"Bb"`）、`sections`、小节拍时间、`patterns` 步进串（鼓也有强弱拍）、`chords` + `follow` 级数、14 种音效和锚点、`at` 收数组、片段的内存缓冲和 `offset` / `duration` / `loop`、增益统一为 dB、乐器目录和默认电平、`duck: "auto"`（2.5 kHz 的让路跟着闪避包络走）、严格校验和“是不是想写”（音效名、`duck: false` 也有）、`report.issues`、空音轨当静音、K 计权的 LUFS、`envelopes: true` 返回每条音轨闪避之后的电平。motionflexlayer 已经整合到 0.4.1：片段在内存里传，包络用闪避后的电平，起音时刻从 `compile()` 取。

还没做或和本文不同的：

| # | 优先级 | 问题 | motionflexlayer 的做法 |
| --- | --- | --- | --- |
| 1 | P1 | 乐器 `gain: 0` 的默认电平是乐器之间配平的，没有参照人声。TTS 旁白按原始电平进来，实测铺底的 `epiano` 只比旁白低 3 dB，有的片子比旁白还响；`voice-masked` 只看 2.5 kHz，不报这种整体偏响 | 示例里铺底写 `gain: -11` 到 `-15`，文档给出起点。建议：有 voice 轨时把 voice 先对齐到一个参考响度，或者加一条“旁白说话时音乐整体只低 N dB”的检查 |
| 2 | P1 | 没有按时间点闪避（底鼓抽吸、冲击点让路），README 建议在 `processTrack` 里做 | `AudioBus.duck.times` 在 `processTrack` 里乘增益曲线 |
| 3 | P1 | 没有压缩和 EQ。旁白峰均比高，响度对齐后限幅器要压 3–4 dB | `AudioBus.comp` 在 `processTrack` 里做前馈压缩 |
| 4 | P2 | 音效的 `size` 过了 0.4 就比旁白冲得多，几个音效叠在段落交界处容易顶到限幅器 | 文档给出 0.2–0.3 的起点，音效轨整体再降 3–8 dB |
| 5 | P2 | 没有 `after-end`（超出 `duration` 的音被静默截掉）、`silent-section`、`loudness-miss` | 无 |

## 模型写音乐时会错在哪

规范的每一条都对着下面某个失败：

| # | 模型常见的错 | 规范怎么防 |
| --- | --- | --- |
| A | 按秒手算节拍，越算越偏；整首几百个音逐个写，又长又容易漏 | 速度和小节是一等公民；节奏用步进串，按段落循环铺满 |
| B | 和弦、贝斯、旋律互相打架，出调 | 写调性和和弦进行，伴奏按和弦级数写，引擎负责落到具体音高 |
| C | 不会配比例：每轨都开满，人声被盖住 | 每种乐器自带能用的电平、声像、混响；有人声时音乐默认让出人声频段 |
| D | 音效对不准画面：whoosh 的最响处不在转场那一帧 | 每种音效规定 `at` 指它的哪一点（峰值、结束点、起音点） |
| E | 字段名凭印象写（`velocity`、`time`、`len`），写错的字段被悄悄丢掉 | 严格校验：未知字段直接报错，并给出“是不是想写 …” |
| F | 听不到成品，不知道哪里不对 | 渲染返回结构化报告：出调、音区越界、力度全一样、音效太密、人声被盖、限幅太深 |
| G | 片子的段落长度由旁白决定，不是整小节 | 段落按秒给出，每段开头重新对齐小节，循环到段尾截断 |

不收 `hue`、`lightness` 这类“视觉映射”参数：它们对模型来说是没有先验知识的数字，写不准。音色只留语义化的乐器名和两个 0–1 旋钮。

## 总体结构

```jsonc
{
  "version": 2,
  "seed": 7,
  "duration": 32,                         // 秒，可省：最后一个事件加尾音
  "tempo": { "bpm": 112, "meter": "4/4", "swing": 0.1 },
  "key": "E minor",
  "sections": [                           // 按秒给，和画面时间轴一致
    { "id": "intro", "at": 0 },
    { "id": "groove", "at": 8.4 },
    { "id": "outro", "at": 27.5 }
  ],
  "tracks": [ /* 见下 */ ],
  "mix": { "loudness": -16, "ceiling": -1 }
}
```

- 段落的结束点是下一段的 `at`，最后一段到 `duration`。
- 只有 `tracks` 是必填。不写 `tempo` 时，只能用秒写时间；不写 `key` 时，不做出调检查。

## 时间和时长

所有时间字段统一叫 `at`，所有时长统一叫 `duration`，单位规则一样：

| 写法 | 含义 |
| --- | --- |
| `3.25` | 绝对秒 |
| `"groove"` | 段落开头 |
| `"groove@2:3"` | 段落里第 2 小节第 3 拍（从 1 开始数，和 DAW 一致） |
| `"5:1"` | 全曲第 5 小节第 1 拍（按 `tempo` 从 0 秒起算） |
| `duration: "1/8"`、`"1/4."`、`"2bar"` | 音符时值（附点用 `.`），或若干小节；数字仍是秒 |

需要卡画面的事件（音效、强拍重音）用秒；音乐内部的事件用小节和拍。两种可以混用。

## 音轨

```jsonc
{
  "id": "keys",
  "role": "music",            // music | sfx | voice
  "instrument": "epiano",
  "gain": 0,                  // dB，相对乐器的默认电平
  "pan": 0,
  "brightness": 0.5,          // 0–1，暗到亮
  "space": 0.3,               // 0–1，干到湿；不写用乐器默认
  "duck": "auto",             // 见“混音”
  // 内容，任意组合：
  "notes": [], "patterns": [], "chords": [], "sfx": [], "clips": []
}
```

### `notes`：逐个写，兜底用

```json
{ "at": "groove@1:1", "pitch": "B4", "duration": "1/8", "velocity": 0.8 }
```

- `pitch` 必填：音名（`C4`、`F#3`、`Bb2`），或 MIDI 数字，或在跟随和弦的音轨上写和弦级数（见下）。鼓轨写鼓件名（`kick`、`snare`），GM 数字也收。
- `velocity` 0–1，默认 0.8。

### `patterns`：步进串，按段落循环

```jsonc
{
  "in": ["groove", "outro"],      // 段落 id，或 { "from": "groove", "to": "outro@2:1" }
  "grid": "1/16",                 // 一个字符占多长，默认 1/16
  "steps": {                      // 鼓：每个鼓件一条串
    "kick":  "x...x...x...x...",
    "snare": "....X.......X..g",
    "hat":   "x.x.x.x.x.x.x.x."
  }
}
```

- 字符：`x` 普通，`X` 重音，`g` 轻音（ghost），`.` 休止。空格和 `|` 忽略，只用来给人看小节线。
- 串长就是循环长度。每个列出的段落从段首重新开始，循环到段尾截断（对应失败 G）。
- 有音高的乐器写空格分隔的记号，每个记号占一格，`-` 延长上一个音：

```json
{ "in": ["groove"], "notes": "1 . . 8 | . 5 - b7 | 1 . . 1 | 3 . 5 ." }
```

在跟随和弦的音轨上，`1 3 5 7 8` 是当前和弦的根音、三音、五音、七音、高八度根音，`b7`、`#4` 等是相对根音的变化音。没有跟随和弦时，记号写音名。贝斯和琶音用级数写，换和弦时自动跟着走，不会出调（对应失败 B）。

### `chords`：和弦进行

```jsonc
{
  "in": ["intro", "groove"],
  "progression": "Em7 A7 | Dmaj7 Bm7",   // 一格一个和弦，| 只是给人看
  "per": "1bar",                         // 每个和弦占多长
  "style": "stab",                       // pad | block | stab | strum | arp-up | arp-down | arp-updown
  "rhythm": "..x...x...x..x..",          // stab / arp 用，规则同 steps
  "register": "C4",                      // 和弦大致落在哪个音区
  "voicing": "close"                     // close | open | spread
}
```

- 引擎负责转位和声部进行，相邻和弦取最近的排法，模型不用自己排音。
- 其它音轨写 `"follow": "keys"`，它们的级数就按这条音轨当时的和弦解释。

### `sfx`：音效，`at` 对准画面事件

```json
{ "type": "whoosh", "at": 8.4, "duration": 0.7, "size": 0.6, "pan": -0.3, "direction": "in" }
```

`at` 可以是一组时间（`"at": [1.2, 1.45, 1.7]`，直接接 `tl.times('type')`）。同一个音效重复时，引擎按 `seed` 给每次一点音高和音色变化，避免机关枪感。

每种音效规定 `at` 指的是哪一点（对应失败 D）：

| type | `at` 指 | 用在 |
| --- | --- | --- |
| `whoosh` | 最响处 | 转场、元素飞过 |
| `riser` | 结束点（冲上去的那一刻），`duration` 是铺垫长度 | 进高潮、揭晓之前 |
| `downlifter` | 起点 | 高潮之后回落 |
| `swell` | 最响处（反向镲） | 进新段落 |
| `impact` | 起音 | 重击、标题砸下 |
| `boom` | 起音，低频为主 | 大标题、片尾 |
| `hit` | 起音，短促 | 数字跳出、卡片落定 |
| `pop` | 起音 | 气泡、图标弹出 |
| `click` / `tick` | 起音 | 界面点击、计数 |
| `type` | 起音，一下一个键 | 打字 |
| `glitch` | 起点，`duration` 是长度 | 故障、科技感切换 |
| `shimmer` | 起音，长尾 | 闪光、高亮 |
| `chime` | 起音 | 完成、成功提示 |

通用参数：`size` 0–1（默认 0.6）、`duration`、`pan`、`brightness`、`pitch`（半音偏移）。`direction` 只用于 whoosh（`in` / `out`）。

### `clips`：音频文件

```json
{ "src": "voice/intro.wav", "at": 0, "offset": 0, "duration": 4.2, "loop": false, "gain": 0, "fadeIn": 0, "fadeOut": 0.3 }
```

- `gain` 是 dB（和音轨一致，全规范只有一种增益单位）。
- 程序调用时可以直接传缓冲：`render(score, { clips: { 'voice/intro.wav': { sampleRate, channels } } })`，不读文件。

## 乐器目录

名字要稳定，引擎换了也不改名。每种乐器自带：音区（报告越界）、默认电平、默认声像、默认混响量。

| 类 | 名字 |
| --- | --- |
| 鼓 | `drums`（鼓件：`kick` `snare` `clap` `rim` `hat` `openhat` `tom-low` `tom-mid` `tom-high` `crash` `ride` `shaker`） |
| 低音 | `bass`（拨奏感）、`sub`（纯低频）、`synth-bass` |
| 和声 | `piano` `epiano` `organ` `pad` `strings` |
| 旋律 | `pluck` `lead` `bell` `marimba` |

不写 `gain` 时，一份只有乐器名的乐谱也应该是平衡的（对应失败 C）。

## 混音

- 每条 `music` 音轨默认 `"duck": "auto"`：乐谱里有 `role: "voice"` 的音轨时，只在 1–4 kHz 让出人声，压住后保持 0.25 秒。`false` 关掉；也可以写完整对象：`{ "by": "vo", "amount": 0.6, "band": [1000, 4000], "hold": 0.25, "release": 0.2 }`。
- 按时间点闪避（给底鼓、冲击点让路）：`{ "at": [...], "amount": 0.5, "release": 0.18 }`。两种可以同时用，`duck` 写成数组。
- `mix.loudness` 是 BS.1770 积分响度（LUFS），不是 RMS。`mix.ceiling` 是真峰值上限。
- 音乐默认带一点人性化（几毫秒的时间抖动和力度变化），`"humanize": 0` 关掉。

## 校验

- 所有对象用严格模式：未知字段报错，并列出最接近的合法字段（`len` → `duration`，`time` → `at`，`vel` → `velocity`）。
- 报错带路径：`tracks[2].patterns[0].steps.kick: 字符 "o" 不认识，可用 x X g .`。
- 空数组合法。程序生成的音轨过滤完可能是空的，不应该让整首渲染失败。

## 渲染结果和报告

```ts
const { left, right, sampleRate, expanded, stems, onsets, report } = render(score, opts)
```

- `expanded`：展开后的乐谱，所有时间是秒、所有音是 MIDI 数字。模型和工具可以检查、比较。
- `stems`：每条音轨闪避之后的分轨。`onsets`：每条音轨的起音时刻。画面读电平和起音要用。
- `report.warnings`：每条带 `code`、位置（音轨、时间）、一句话描述和一条改法：

| code | 什么时候报 |
| --- | --- |
| `out-of-key` | 强拍上的音不在调内，也不在当时的和弦里 |
| `out-of-range` | 超出乐器音区（贝斯写到 C6） |
| `flat-velocity` | 一条音轨 16 个音以上，力度全一样 |
| `sfx-dense` | 同一音轨两个音效间隔小于 0.12 秒 |
| `after-end` | 事件超出 `duration` |
| `silent-section` | 某个段落里没有任何音乐 |
| `voice-masked` | 人声说话时，音乐在 1–4 kHz 离人声不到 6 dB |
| `limiter-heavy` | 限幅超过 3 dB |
| `loudness-miss` | 实测响度离目标超过 1 LU |

## 文档形态

- 一页速查（`llms.txt`）：字段表、时间写法、步进串规则、乐器和音效目录、三个完整示例（旁白产品片、卡点剪辑、科技感界面）。模型只读这一页就能写。
- `visualtone schema` 输出 JSON Schema，字段带中文或英文描述，给结构化输出用。

## 为什么不用现成格式

- **MIDI / MIDI 的 JSON 版：** 逐音写，太长，没有段落、和弦、音效、混音。
- **ABC 记谱：** 模型熟悉，但只管旋律，鼓、音效、按秒对齐都没有。
- **Strudel / Tidal 的 mini-notation：** 表达力强，但嵌套语法（`<>`、`[]`、`*`、`/`）模型容易写错，也很难给出逐字段的报错。

这里的做法是：结构用 JSON（能严格校验、能报路径），只在最需要紧凑的地方（一小节的节奏、一串级数）用一行字符串，规则只有几条。

## 完整示例：30 秒旁白产品片

```jsonc
{
  "version": 2,
  "tempo": { "bpm": 96 },
  "key": "D major",
  "sections": [{ "id": "intro", "at": 0 }, { "id": "body", "at": 6.2 }, { "id": "outro", "at": 25.8 }],
  "duration": 30,
  "tracks": [
    { "id": "vo", "role": "voice", "clips": [{ "src": "voice/all.wav", "at": 0.4 }] },
    { "id": "keys", "instrument": "epiano",
      "chords": [{ "in": ["intro", "body", "outro"], "progression": "Dmaj7 Bm7 Gmaj7 A", "per": "1bar", "style": "pad" }] },
    { "id": "bass", "instrument": "bass", "follow": "keys",
      "patterns": [{ "in": ["body"], "notes": "1 . . . . . 5 . | 1 . . 8 . . 5 ." }] },
    { "id": "drums", "instrument": "drums",
      "patterns": [{ "in": ["body"], "steps": { "kick": "x.......x.x.....", "snare": "....x.......x...", "hat": "..x...x...x...x." } }] },
    { "id": "fx", "role": "sfx", "sfx": [
      { "type": "swell", "at": 6.2 },
      { "type": "whoosh", "at": [9.8, 15.1], "direction": "in" },
      { "type": "hit", "at": 18.4 },
      { "type": "riser", "at": 25.8, "duration": 2 },
      { "type": "boom", "at": 25.8 }
    ] }
  ],
  "mix": { "loudness": -16 }
}
```

音乐轨都没写 `duck`，有 `vo` 时自动让出人声；都没写 `gain`，按乐器默认电平配好。

## motionflexlayer 这边怎么接

- 时间轴的段落直接写进 `sections`，`tl.times('…')` 直接给 `sfx.at`，旁白的音频直接进 `role: "voice"` 的 `clips`。
- `AudioSpec` 的母线、循环、声像烘焙、按时间闪避、LUFS 测量这些绕路代码都可以删掉，只剩一层把时间轴翻译成乐谱的薄壳。
- `audio` 命令直接打印 `report.warnings`；`envelopes: true` 用 `stems` 和 `onsets`。

## 优先级

| 优先级 | 改动 | 对应失败 |
| --- | --- | --- |
| P0 | 严格校验和“是不是想写”提示；`pitch` 必填；空音轨合法 | E |
| P0 | 统一 `at` / `duration`；`tempo`、`sections`、小节拍时间写法 | A、G |
| P0 | 音效的锚点规定；`at` 收数组；补齐音效目录 | D |
| P0 | 片段：内存缓冲、`offset`、`duration`、`loop`；增益统一为 dB | — |
| P0 | 返回闪避后的 `stems` 和 `onsets` | F |
| P1 | `patterns` 步进串；`chords` 和 `follow` 级数 | A、B |
| P1 | 乐器默认电平和音区；自动让出人声频段；LUFS | C |
| P1 | `report.warnings` 和 `expanded` | F |
| P2 | 人性化默认值；重复音效的随机变化 | — |
| P2 | 轨道级自动化（音量、亮度、声像关键帧），做跟镜头同步的扫频和渐强 | — |
