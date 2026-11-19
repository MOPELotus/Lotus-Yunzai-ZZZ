const identity = (message: string) => message;

// Preserve the engine's diagnostic paths without a legacy global logger.
export const logger = {
  warn: (..._fields: unknown[]) => undefined,
  error: (..._fields: unknown[]) => undefined,
  debug: (..._fields: unknown[]) => undefined,
  green: identity,
  red: identity,
  blue: identity,
  yellow: identity,
  magenta: identity,
};

export function sortBuffs<T extends { type: string; value: number }>(buffs: T[]) {
  return buffs.sort((left, right) => left.type < right.type ? -1 : left.type > right.type ? 1 : left.value - right.value);
}
