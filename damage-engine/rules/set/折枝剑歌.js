// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/折枝剑歌.js.
// 函数导出：

/**
 * @param {import('#interface').BuffManager} buffM
 * @param {number} count 套装数量
 */
// export function calc(buffM, count) {
//   const name = buffM.defaultBuff.name
//   switch (true) {
//     case (count >= 4):
//       buffM.new({
//         name: name + '4',
//         type: '暴击伤害',
//         value: 0.3,
//         check: ({ buffM, calc }) => calc.get_AnomalyMastery() >= 115
//       })
//       buffM.new({
//         name: name + '4',
//         type: '暴击率',
//         value: 0.12
//       })
//   }
// }

// 直接导出：

/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    name: '折枝剑歌4',
    type: '暴击伤害',
    value: 0.3,
    check: ({ buffM, calc }) => buffM.setCount.折枝剑歌 >= 4 && calc.get_AnomalyMastery() >= 115
  },
  {
    type: '暴击率',
    value: 0.12,
    check: 4
  }
]
