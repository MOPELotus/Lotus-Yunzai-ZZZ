// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, weapon/思络成歌.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: [0.125, 0.143, 0.161, 0.179, 0.2].map(v => v * 2),
    teamTarget: true,
    check: ({ avatar, runtime }) => avatar.element_type === runtime.elementEnum.Physical,
    stackable: false,
  },
  {
    type: '攻击力',
    value: [0.1, 0.115, 0.13, 0.145, 0.16],
    teamTarget: true,
    check: ({ avatar, runtime }) => avatar.element_type === runtime.elementEnum.Physical,
    stackable: false,
  }
]