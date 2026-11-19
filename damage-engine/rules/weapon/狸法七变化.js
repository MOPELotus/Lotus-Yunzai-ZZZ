// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/狸法七变化.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '异常掌控',
    value: [30, 34, 39, 43, 48],
    check: ({ avatar }) => avatar.element_type === 200
  },
  {
    type: '异常精通',
    teamTarget: true,
    stackable: false,
    value: [60, 69, 78, 87, 96]
  }
]