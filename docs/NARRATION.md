# 旁白

有旁白的片子，时长由旁白决定：先写文案，念出来，再按念出来的长度排段落。画面、音乐、字幕都从这份排期里取时间。

```
文案（每句一个 id）
   ↓ narration()：TTS 合成，按内容缓存
每句的音频 + 逐词时间
   ↓ 排期：留白 → 说话 → 停留，段落首尾相接
段落、cue、字幕、旁白片段
```

完整示例见 [examples/narrated](../examples/narrated/index.ts)。

## 写法

```ts
import { defineComposition, narration } from 'motionflexlayer'

const vo = await narration(
  [
    { id: 'intro', text: '这是一段用代码写出来的短片。', minDuration: 3.2 },
    { id: 'frame', text: '每一帧都是时间的函数。' },
    { id: 'outro', text: '改一句文案，重新渲染。', data: { accent: '#d9472b' } },
  ],
  { baseDir: import.meta.url, voice: 'zh-CN-XiaoxiaoNeural', rate: '+4%' },
)

export default defineComposition({
  width: 1920, height: 1080, fps: 30,
  duration: vo.duration,
  timeline: vo.timeline(),
  render: (f) => { /* f.section.name 是当前这句的 id */ },
  audio: () => ({
    clips: vo.clips(),                                   // 进 'voice' 母线
    buses: { music: { duck: { by: 'voice', depth: 0.6, band: [1000, 4000] } } },
  }),
})
```

模块顶层可以直接 `await`（入口是 ESM，由 tsx 加载）。

## 每一句 `NarrationLine`

| 字段 | 说明 |
| --- | --- |
| `id` | 段落名，也是 cue 名。帧函数里用 `f.section.name` 判断当前是哪一句 |
| `text` | 要念的文字，字幕也用它 |
| `pre` | 开口前的留白，秒。缺省：第一句用 `lead`，其余用 `gap` |
| `post` | 说完后画面再停多久，秒。缺省：最后一句用 `tail`，其余用 `hold` |
| `minDuration` | 这一段至少多长。旁白短但画面要讲清楚时用，多出来的时间加在说完之后 |
| `voice` / `rate` / `pitch` | 覆盖全局设置，例如对话里换一个声音 |
| `file` | 用录好的音频代替合成。没有逐词时间，按字数平均估计 |
| `data` | 原样放进段落的 data，帧函数里从 `f.section.data` 取 |

全局选项：`lead`（片头留白，默认 0.6）、`gap`（句间留白，默认 0.35）、`hold`（句后停留，默认 0.25）、`tail`（片尾停留，默认 1.2）、`cacheDir`（默认 `voice`）、`offline`。

## 排期结果

`vo.lines` 里每句有：

- `from` / `to`：段落起止，含留白。相邻段落首尾相接，第一段从 0 开始；
- `speechFrom` / `speechTo`：开口和收声；
- `words`：逐词时间。`from` / `to` 是全片时间，`start` / `end` 是这个词在 `text` 里的字符位置（紧跟的标点算在前一个词里）；
- `file`：音频文件。

`vo.duration` 是最后一段的结尾，直接作为合成的 `duration`。

`vo.timeline()` 或 `vo.apply(tl)` 往时间轴登记：

| 名字 | 时刻 | data |
| --- | --- | --- |
| 段落 `<id>` | `from` | `{ text, ...line.data }` |
| cue `<id>` | `speechFrom` | `{ text }` |
| cue `line` | 每句的 `speechFrom` | `{ id }` |
| cue `word` | 每个词的 `from` | `{ line, text }` |

这些 cue 都带 `audit: false`，音频报告不拿它们检查音效落点。

## 画面跟着旁白

- **关键词落点。** 画面的变化放在关键词开口的那一刻：

  ```ts
  const SEPARATE = vo.line('check').words.find((w) => w.text.includes('重叠'))!.from
  ```

- **字幕。** `vo.caption(f.t)` 返回 `{ line, spoken, word, progress, speaking }`。`line.text.slice(0, spoken)` 是念过的部分；`word` 是正在念的词，`progress` 是它的进度。示例里念过的字是墨色，正在念的词是强调色，还没念到的是浅灰。
- **逐词出现。** `line.words.filter((w) => w.from <= f.t)` 就是已经念出来的词，配 `spring(f.t - w.from)` 逐个弹出。
- **电平。** 合成写 `envelopes: true` 后，`f.audio.level('voice')` 是旁白此刻的电平，可以驱动波形、口型、光晕。

## 声音

- 旁白进 `voice` 母线（`vo.clips()` 的默认值），母线名为 `voice` 时自动标记 `role: 'voice'`，visualtone 按 voiceover-bed 档案分析。
- 音乐让路：`duck: { by: 'voice', depth: 0.6, band: [1000, 4000] }`。只压 1–4 kHz，低频的温暖保留。visualtone 原生音轨直接写 `duck: { by: 'voice', amount: 0.6, band: [1000, 4000] }`。
- 旁白可以加压缩让音量更稳：`buses: { voice: { comp: { threshold: -24, ratio: 2.5, attackMs: 8, releaseMs: 120, knee: 6, makeup: 0 } } }`。
- 检查 `audio` 报告的“旁白：1–4 kHz 高出音乐 N dB”，至少 6 dB；不到就降音乐或加大 duck 的 depth。

## 合成引擎与缓存

默认引擎是 [edge-tts](https://github.com/rany2/edge-tts)（微软 Edge 在线语音，免费，不需要密钥，要联网）：

```bash
pip install edge-tts
edge-tts --list-voices | grep zh-CN    # 可用的中文声音
```

Python 路径用环境变量 `MFL_PYTHON` 覆盖，缺省 `python3`。

缓存在入口旁边的 `voice/` 目录，每句两个文件：`<键>.mp3` 和 `<键>.json`（时长、逐词时间、原文）。键由引擎、声音、语速、音高、音量、文字算出，改一个字就是新的一条。

- **把 `voice/` 提交进仓库。** 别人拉下来渲染时不用联网，结果也完全一样。
- 删掉不用的缓存不影响什么，下次缺了会重新合成。
- `MFL_TTS_OFFLINE=1`（或 `offline: true`）时缓存缺失直接报错，CI 里用。
- 多进程渲染时，每个 worker 重新加载入口、读同一份缓存。缓存先写临时文件再改名，不会读到半个文件。

### 换引擎

实现 `TtsEngine`：

```ts
const myEngine: TtsEngine = {
  name: 'my-tts',
  ext: 'wav',
  async synthesize({ text, voice, rate }, out) {
    // 把 text 念成 out 指向的文件，返回逐词时间（秒，相对这句开头）
    return [{ text: '你好', from: 0.05, to: 0.42 }, …]
  },
}
await narration(lines, { baseDir: import.meta.url, engine: myEngine })
```

本地模型、商用 API、真人录音加强制对齐，都可以包成这个接口。拿不到逐词时间时，返回按字数平均的估计，字幕仍然能用，只是高亮不那么准。

## 注意

- 引擎会改写一些写法（数字、英文缩写），对不回原文的词会占一个空位，不影响字幕显示，只是高亮跳过它。数字最好在文案里就写成汉字。
- edge-tts 是在线服务，声音和停顿偶尔会随服务端更新而变化；缓存保证同一份仓库的结果不变。
- 合成器的念法不对时（多音字、停顿），改文案比调参数有效：加逗号、换同义词。
