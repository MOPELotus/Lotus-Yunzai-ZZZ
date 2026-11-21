// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/钢铁肉垫.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: [0.2, 0.25, 0.3, 0.35, 0.4],
    element: 'Physical'
  },
  {
    type: '增伤',
    value: [0.25, 0.315, 0.38, 0.44, 0.5]
  }
]