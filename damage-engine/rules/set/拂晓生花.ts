// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/拂晓生花.js.
import type { BuffRule } from "../../rule-types.ts";

export const buffs: BuffRule[] = [
  {
    type: '增伤',
    value: 0.15,
    check: 2,
    range: ['A']
  },
  {
    type: '增伤',
    value: 0.2,
    check: 4,
    range: ['A']
  },
  {
    type: '增伤',
    value: 0.2,
    check: ({ avatar, buffM, runtime }) =>
      buffM.setCount.拂晓生花! >= 4 && avatar.avatar_profession === runtime.professionEnum.强攻, // 仅强攻角色
    range: ['A']
  }
]
