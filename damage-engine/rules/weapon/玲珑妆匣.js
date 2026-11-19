// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/玲珑妆匣.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    teamTarget: true,
    stackable: false,
    value: [0.1, 0.115, 0.13, 0.145, 0.16].map(v => v * 2)
  }
]