// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/玉壶青冰.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '冲击力',
    value: [0.007, 0.0088, 0.0105, 0.0122, 0.014].map(v => v * 30)
  },
  {
    type: '增伤',
    teamTarget: true,
    stackable: false,
    value: [0.2, 0.23, 0.26, 0.29, 0.32]
  }
]