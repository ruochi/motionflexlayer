/**
 * 这支片子的样子：深底、琥珀和青色的光、发光描边、颗粒和暗角、四角的 HUD。
 *
 * 这是 showreel 的创意选择，不是框架默认，也不是推荐的风格。新片子从自己的需求定色板、字体和运动，
 * 不要沿用这一块。draws.ts 里还有一些就地写的高光色（偏白的暖色），同样属于这支片子。
 */
export const BG = '#07080d'
export const INK = '#f4f1ea'
export const MUTED = '#8d97a8'
export const AMBER = '#ffb547'
export const CORAL = '#ff5d73'
export const CYAN = '#4fd1ff'
export const VIOLET = '#8b7bff'

/** 粒子的四层颜色，聚成文字时从左到右渐变。 */
export const LAYER_COLORS = [INK, CYAN, VIOLET, CORAL]
export const TEXT_LEFT = '#ffcf7a'
export const TEXT_RIGHT = '#ff6a7f'
