// SPDX-License-Identifier: AGPL-3.0-only
// From ZZZure/ZZZ-Plugin bf47b77790aa7540f03a1e3c6866be0876b12b82, set/山大王.js.
/** @type {import('#interface').buff[]} */
export const buffs = [
  {
    type: '暴击伤害',
    teamTarget: true,
    stackable: false,
    value: ({ calc }) => {
      if (calc.get_CRITRate() >= 0.5) {
        return 0.3
      }
      return 0.15
    },
    check: ({ buffM, avatar, runtime }) =>
      buffM.setCount.山大王 >= 4 && avatar.avatar_profession === runtime.professionEnum.击破
  }
]
