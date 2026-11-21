// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/福虓炉炉.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    check: ({ avatar }) => avatar.element_type === 201,
    value: [0.1, 0.115, 0.13, 0.145, 0.16].map(v => v * 2),
    teamTarget: true,
    stackable: false
  }
]