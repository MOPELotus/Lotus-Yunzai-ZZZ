// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/电波漫步.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '贯穿力',
    value: [80, 92, 104, 116, 128].map(v => v * 3)
  }
]