// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/「月相」-望.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: [0.12, 0.14, 0.16, 0.18, 0.2],
    range: ['A', 'CC', 'CF']
  }
]
