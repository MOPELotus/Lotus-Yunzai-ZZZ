// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/牺牲洁纯.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '暴击伤害',
    value: [0.3, 0.345, 0.39, 0.435, 0.48]
  },
  {
    type: '暴击伤害',
    value: [0.1, 0.115, 0.13, 0.145, 0.16].map(v => v * 3),
  },
  {
    type: '增伤',
    value: [0.2, 0.23, 0.26, 0.29, 0.32],
    element: 'Electric'
  }
]