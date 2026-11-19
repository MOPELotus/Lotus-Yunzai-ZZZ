// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/机巧心种.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '暴击率',
    value: [0.15, 0.17, 0.19, 0.21, 0.23]
  },
  {
    type: '增伤',
    value: [0.125, 0.145, 0.165, 0.185, 0.2].map(v => v * 2),
    element: 'Electric'
  },
  {
    type: '无视防御',
    value: [0.2, 0.23, 0.26, 0.29, 0.32],
    range: ['A', 'RZ']
  }
]