// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/怒目金刚.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: "暴击率",
    value: [0.2, 0.23, 0.26, 0.29, 0.32],
  },
  {
    type: "贯穿增伤",
    value: [0.09, 0.1035, 0.117, 0.1305, 0.144].map(v => v * 2),
    element: "Fire",
  },
]
