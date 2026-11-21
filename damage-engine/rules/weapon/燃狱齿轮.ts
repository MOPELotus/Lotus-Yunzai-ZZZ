// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/燃狱齿轮.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '冲击力',
    value: [0.1, 0.125, 0.15, 0.175, 0.2].map(v => v * 2)
  }
]