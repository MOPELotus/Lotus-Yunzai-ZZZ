// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/霰落星殿.js.
import type { BuffRule } from "../../rule-types.ts";

// 函数导出：

/**
 * @param {import('#interface').BuffManager} buffM
 * @param {number} star 进阶星数
 */
// export function calc(buffM, star) {
//   buffM.new({
//     type: '暴击伤害',
//     value: [0.5, 0.57, 0.65, 0.72, 0.8][star - 1]
//   })
//   buffM.new({
//     type: '增伤',
//     value: [0.2, 0.23, 0.26, 0.29, 0.32][star - 1] * 2,
//     element: 'Ice'
//   })
// }

// 直接导出：

export const buffs: BuffRule[] = [
  {
    type: '暴击伤害',
    value: [0.5, 0.57, 0.65, 0.72, 0.8]
  },
  {
    type: '增伤',
    value: [0.2, 0.23, 0.26, 0.29, 0.32].map(v => v * 2),
    element: 'Ice'
  }
]