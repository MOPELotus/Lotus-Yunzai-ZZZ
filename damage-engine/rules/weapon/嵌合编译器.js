// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/嵌合编译器.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '攻击力',
    value: [0.12, 0.15, 0.18, 0.21, 0.24]
  },
  {
    type: '异常精通',
    value: [25, 31, 37, 43, 50].map(v => v * 3)
  }
]