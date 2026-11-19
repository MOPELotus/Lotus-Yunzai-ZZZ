// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/聚宝箱.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    value: [0.15, 0.175, 0.2, 0.22, 0.24],
    check: ({ avatar }) => avatar.element_type === 205
  }
]