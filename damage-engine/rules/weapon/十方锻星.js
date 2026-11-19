// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/十方锻星.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '异常掌控',
    value: [60, 69, 78, 87, 96]
  },
  {
    type: '增伤',
    value: [0.2, 0.23, 0.26, 0.29, 0.32].map(v => v * 2),
    element: 'Physical'
  }
]