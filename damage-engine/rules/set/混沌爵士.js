// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/混沌爵士.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    value: 0.15,
    element: ['Electric', 'Fire'],
    check: 4
  },
  {
    type: '增伤',
    value: 0.2,
    check: 4,
    range: ['EQ', 'L']
  }
]