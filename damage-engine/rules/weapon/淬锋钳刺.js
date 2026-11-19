// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/淬锋钳刺.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '增伤',
    value: [0.12, 0.15, 0.18, 0.21, 0.24].map(v => v * 3),
    element: 'Physical'
  }
]