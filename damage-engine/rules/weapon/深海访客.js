// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/深海访客.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    value: [0.25, 0.315, 0.38, 0.445, 0.5],
    element: 'Ice'
  },
  {
    type: '暴击率',
    value: [0.1, 0.125, 0.15, 0.175, 0.2].map(v => v * 2)
  }
]