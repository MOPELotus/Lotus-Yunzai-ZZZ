// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/云霓孤光.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '无视抗性',
    value: [0.2, 0.22, 0.24, 0.26, 0.28],
    element: 'Physical'
  },
  {
    type: '增伤',
    value: [0.25, 0.287, 0.325, 0.362, 0.4] // [以太帷幕]直接视为生效
  },
  {
    type: '暴击伤害',
    value: [0.25, 0.287, 0.325, 0.362, 0.4]
  }
]