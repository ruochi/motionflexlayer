import { narration } from 'motionflexlayer'

/** 文案。每句一个镜头；镜头里的动作卡在句中的词上（见 index.ts 的 at()）。 */
export const vo = await narration(
  [
    { id: 'intro', text: '这支片子里的每个镜头，换成网页或者手写 canvas，都要多费不少力气。', pre: 1.6 },
    { id: 'glyphs', text: '文字先交给排版，再拆成一个个字形。每个字都知道自己落在哪一行、哪一格。', post: 0.2 },
    { id: 'reflow', text: '栏宽一变，换行重新算；改成竖排，每个字也自己找到新的位置。', post: 0.8 },
    { id: 'stroke', text: '描边沿着字的墨迹走。几个字叠在一起，只描一圈外轮廓。', post: 0.9 },
    { id: 'glass', text: '玻璃只在边缘折射，中间透出的画面不变形。透镜可以是任何形状，包括文字。', post: 0.9 },
    { id: 'solid', text: '同一个字形挤出厚度，就是一块立体的字，有光照，也有投影。', post: 1.2 },
    { id: 'camera', text: '镜头可以推向任意一点。这一点由排版算出：整页文字里，“这里”两个字的位置。', post: 0.9 },
    { id: 'report', text: '每一帧都有一份排版报告。对齐可以按字的着墨，而不是按盒子。', post: 1.2 },
    { id: 'outro', text: 'flexlayer 排版和绘制，visualtone 配乐，motionflexlayer 把它们接到同一条时间轴上。' },
  ],
  { baseDir: import.meta.url, voice: 'zh-CN-YunxiNeural', rate: '+6%', gap: 0.45, tail: 2.2 },
)
