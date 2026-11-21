// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/焰心桂冠.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '冲击力',
    value: [0.25, 0.2875, 0.325, 0.3625, 0.4]
  },
  {
    type: '暴击伤害',
    teamTarget: true,
    stackable: false,
    value: [0.015, 0.0172, 0.0195, 0.0217, 0.024].map(v => v * 20),
    element: ['Ice', 'Fire']
  }
]