export function success<T>(data: T, meta: Record<string, unknown> = {}) {
  return { success: true as const, data, meta: { source: 'Universal Cosmos', timestamp: new Date().toISOString(), ...meta } };
}
