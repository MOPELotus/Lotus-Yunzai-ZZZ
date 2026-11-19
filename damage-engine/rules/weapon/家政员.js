// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/家政员.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    value: [0.03, 0.035, 0.04, 0.044, 0.048].map(v => v * 15),
    element: 'Physical',
    range: ['EQ'] // 只持续1s
  }
]
