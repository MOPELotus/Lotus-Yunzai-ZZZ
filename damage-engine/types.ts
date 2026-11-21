import type { anomaly } from "./BuffManager.ts";

export interface DamageProperties extends Record<string, number> {
  HP: number;
  ATK: number;
  DEF: number;
  Impact: number;
  CRITRate: number;
  CRITDMG: number;
  AnomalyMastery: number;
  AnomalyProficiency: number;
  Pen: number;
  PenRatio: number;
  EnergyRegen: number;
}

export interface DamageAvatar {
  readonly id: number;
  readonly level: number;
  readonly rank: number;
  readonly element_type: number;
  readonly sub_element_type: number;
  readonly avatar_profession: number;
  readonly name_mi18n: string;
  readonly equip_score?: number;
  readonly scoreWeight: Readonly<Partial<Record<number, number>>>;
  readonly weapon: { readonly name: string; readonly star: number; readonly profession?: number } | null;
  readonly equip: readonly {
    readonly equipment_type: number;
    readonly equip_suit: { readonly name: string };
    readonly main_properties: readonly { readonly property_id: number; readonly property_name: string; readonly base: string }[];
  }[];
  readonly skills: readonly { readonly skill_type: number; readonly level: number }[];
  _base_properties?: DamageProperties;
  _initial_properties?: DamageProperties;
  readonly base_properties: DamageProperties;
  readonly initial_properties: DamageProperties;
}

export interface DamageData {
  readonly character: {
    readonly skill: Readonly<Partial<Record<string, readonly number[]>>>;
    readonly buff?: Readonly<Partial<Record<string, readonly number[]>>>;
  };
  readonly anomaly: readonly {
    readonly name: anomaly;
    readonly duration: number;
    readonly interval: number;
    readonly multiplier: number;
    readonly element_type: number;
    readonly sub_element_type: number;
    readonly discover?: { readonly multiplier: number; readonly fixed_multiplier: number };
  }[];
  readonly property: {
    idToName(id: number | string): string | null;
    nameToShortName3(name: string): string;
    nameZHToNameEN(name: string): string;
  };
}
