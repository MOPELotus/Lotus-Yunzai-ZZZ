import type { BuffManager, buff } from "./BuffManager.ts";
import type { skill } from "./Calculator.ts";

// Rules are declarations. The engine adds runtime defaults at registration.
type BuffDefaults = "name" | "source" | "status";
export type BuffRule = Omit<buff, BuffDefaults | "element"> & Partial<Pick<buff, BuffDefaults>> & {
  // Two pinned rules use this literal. Keep it as written, with the original matching behavior.
  element?: buff["element"] | "Physics";
};
export type TeamBuffSelector = Exclude<NonNullable<BuffRule["teamTarget"]>, boolean>;
export type BeforeSkill = NonNullable<skill["before"]>;

export type SkillRule = Omit<skill, "element" | "check"> & {
  element?: skill["element"];
  check?: skill["check"] | number;
};

export interface DamageRule {
  readonly buffs?: readonly BuffRule[];
  readonly skills?: readonly SkillRule[];
  readonly calc?: (buffs: BuffManager, rank: number) => void;
}

export interface CharacterRule extends DamageRule {
  readonly name?: string;
  readonly author?: string;
  readonly skills: readonly SkillRule[];
}
