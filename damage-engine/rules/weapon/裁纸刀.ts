// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/裁纸刀.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: [0.15, 0.173, 0.195, 0.218, 0.24],
    element: 'Physical'
  }
]