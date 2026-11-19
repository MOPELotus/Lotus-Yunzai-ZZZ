// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/啜泣摇篮.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    teamTarget: true,
    stackable: false,
    value: [0.1, 0.125, 0.15, 0.175, 0.2]
  },
  {
    type: '增伤',
    teamTarget: true,
    stackable: false,
    value: [0.017, 0.02, 0.025, 0.03, 0.033].map(v => v * 6)
  }
]