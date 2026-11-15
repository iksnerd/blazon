export class InvalidValue extends Error {}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fail(message: string): never {
  throw new InvalidValue(message);
}
