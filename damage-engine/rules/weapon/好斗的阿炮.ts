// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/好斗的阿炮.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '攻击力',
    value: [0.025, 0.028, 0.032, 0.036, 0.04].map(v => v * 4),
  }
]