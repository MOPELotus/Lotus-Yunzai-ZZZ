// AGPL-3.0-only. Supported rule modules from ZZZure/ZZZ-Plugin bf47b77.
import type { buff } from "./BuffManager.ts";
import type { Calculator, skill } from "./Calculator.ts";
import type { BuffManager } from "./BuffManager.ts";
import * as character1 from "./rules/character/安比.js";
import * as character2 from "./rules/character/安东.js";
import * as character3 from "./rules/character/莱卡恩.js";
import * as character4 from "./rules/character/艾莲.js";
import * as character5 from "./rules/character/朱鸢.js";
import * as character6 from "./rules/character/比利.js";
import * as character7 from "./rules/character/可琳.js";
import * as character8 from "./rules/character/猫又.js";
import * as weapon1 from "./rules/weapon/「月相」-晦.js";
import * as weapon2 from "./rules/weapon/「月相」-望.js";
import * as weapon3 from "./rules/weapon/人为刀俎.js";
import * as weapon4 from "./rules/weapon/仿制星徽引擎.js";
import * as weapon5 from "./rules/weapon/加农转子.js";
import * as weapon6 from "./rules/weapon/家政员.js";
import * as weapon7 from "./rules/weapon/德玛拉电池Ⅱ型.js";
import * as weapon8 from "./rules/weapon/拘缚者.js";
import * as weapon9 from "./rules/weapon/旋钻机-赤轴.js";
import * as weapon10 from "./rules/weapon/星徽引擎.js";
import * as weapon11 from "./rules/weapon/正版变身器.js";
import * as weapon12 from "./rules/weapon/鎏金花信.js";
import * as weapon13 from "./rules/weapon/千面日陨.js";
import * as weapon14 from "./rules/weapon/幻变魔方.js";
import * as weapon15 from "./rules/weapon/强音热望.js";
import * as weapon16 from "./rules/weapon/深海访客.js";
import * as weapon17 from "./rules/weapon/燃狱齿轮.js";
import * as weapon18 from "./rules/weapon/硫磺石.js";
import * as weapon19 from "./rules/weapon/街头巨星.js";
import * as weapon20 from "./rules/weapon/裁纸刀.js";
import * as weapon21 from "./rules/weapon/钢铁肉垫.js";
import * as weapon22 from "./rules/weapon/防暴者Ⅵ型.js";
import * as set1 from "./rules/set/云岿如我.js";
import * as set2 from "./rules/set/原始朋克.js";
import * as set3 from "./rules/set/啄木鸟电音.js";
import * as set4 from "./rules/set/如影相随.js";
import * as set5 from "./rules/set/山大王.js";
import * as set6 from "./rules/set/折枝剑歌.js";
import * as set7 from "./rules/set/拂晓生花.js";
import * as set8 from "./rules/set/摇摆爵士.js";
import * as set9 from "./rules/set/月光骑士颂.js";
import * as set10 from "./rules/set/极地重金属.js";
import * as set11 from "./rules/set/沧浪行歌.js";
import * as set12 from "./rules/set/河豚电音.js";
import * as set13 from "./rules/set/激素朋克.js";
import * as set14 from "./rules/set/炎狱重金属.js";
import * as set15 from "./rules/set/獠牙重金属.js";
import * as set16 from "./rules/set/雷暴重金属.js";
import * as set17 from "./rules/set/静听嘉音.js";
import * as set18 from "./rules/set/法厄同之歌.js";
import * as set19 from "./rules/set/流光咏叹.js";
import * as set20 from "./rules/set/混沌重金属.js";

interface Rule {
  readonly buffs?: readonly buff[];
  readonly skills?: readonly skill[];
  readonly calc?: (buffs: BuffManager, rank: number) => void;
}

export const characterRules: Readonly<Partial<Record<string, Rule>>> = {
  "安比": character1 as Rule,
  "安东": character2 as Rule,
  "莱卡恩": character3 as Rule,
  "艾莲": character4 as Rule,
  "朱鸢": character5 as Rule,
  "比利": character6 as Rule,
  "可琳": character7 as Rule,
  "猫又": character8 as Rule,
};

export const weaponRules: Readonly<Partial<Record<string, Rule>>> = {
  "「月相」-晦": weapon1 as Rule,
  "「月相」-望": weapon2 as Rule,
  "人为刀俎": weapon3 as Rule,
  "仿制星徽引擎": weapon4 as Rule,
  "加农转子": weapon5 as Rule,
  "家政员": weapon6 as Rule,
  "德玛拉电池Ⅱ型": weapon7 as Rule,
  "拘缚者": weapon8 as Rule,
  "旋钻机-赤轴": weapon9 as Rule,
  "星徽引擎": weapon10 as Rule,
  "正版变身器": weapon11 as Rule,
  "鎏金花信": weapon12 as Rule,
  "千面日陨": weapon13 as Rule,
  "幻变魔方": weapon14 as Rule,
  "强音热望": weapon15 as Rule,
  "深海访客": weapon16 as Rule,
  "燃狱齿轮": weapon17 as Rule,
  "硫磺石": weapon18 as Rule,
  "街头巨星": weapon19 as Rule,
  "裁纸刀": weapon20 as Rule,
  "钢铁肉垫": weapon21 as Rule,
  "防暴者Ⅵ型": weapon22 as Rule,
};

export const setRules: Readonly<Partial<Record<string, Rule>>> = {
  "云岿如我": set1 as Rule,
  "原始朋克": set2 as Rule,
  "啄木鸟电音": set3 as Rule,
  "如影相随": set4 as Rule,
  "山大王": set5 as Rule,
  "折枝剑歌": set6 as Rule,
  "拂晓生花": set7 as Rule,
  "摇摆爵士": set8 as Rule,
  "月光骑士颂": set9 as Rule,
  "极地重金属": set10 as Rule,
  "沧浪行歌": set11 as Rule,
  "河豚电音": set12 as Rule,
  "激素朋克": set13 as Rule,
  "炎狱重金属": set14 as Rule,
  "獠牙重金属": set15 as Rule,
  "雷暴重金属": set16 as Rule,
  "静听嘉音": set17 as Rule,
  "法厄同之歌": set18 as Rule,
  "流光咏叹": set19 as Rule,
  "混沌重金属": set20 as Rule,
};

export const unsupportedWeaponRules = new Set([
  "「恒等式」-本格",
  "「残响」-Ⅰ型",
  "「残响」-Ⅱ型",
  "「残响」-Ⅲ型",
  "「湍流」-斧型",
  "「灰烬」-钴蓝",
  "「电磁暴」-壹式",
  "「电磁暴」-贰式",
  "云霓孤光",
  "兔能环",
  "十方锻星",
  "双生泣星",
  "含羞恶面",
  "啜泣摇篮",
  "奔袭獠牙",
  "好斗的阿炮",
  "嵌合编译器",
  "心弦夜响",
  "怒目金刚",
  "思络成歌",
  "时流贤者",
  "机巧心种",
  "残心青囊",
  "淬锋钳刺",
  "灼心摇壶",
  "焰心桂冠",
  "燔火胧夜",
  "牺牲洁纯",
  "狸法七变化",
  "玉壶青冰",
  "玲珑妆匣",
  "电波漫步",
  "禁罪囚笼",
  "福虓炉炉",
  "索魂影眸",
  "聚宝箱",
  "触电唇彩",
  "轰鸣座驾",
  "辉骑面铠",
  "逍遥游球",
  "雨林饕客",
  "震元奇枢",
  "霰落星殿",
  "青溟笼舍",
  "青漪灵鼎",
  "飞鸟星梦",
]);

export const unsupportedSetRules = new Set([
  "混沌爵士",
]);
