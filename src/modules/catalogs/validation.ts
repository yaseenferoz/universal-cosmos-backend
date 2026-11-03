import { z } from 'zod';
import { AppError } from '../../utils/errors.js';

export function parseUpstream<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'Astronomy provider returned an invalid response');
  return parsed.data;
}

const tapSchema = z.object({ metadata: z.array(z.object({ name: z.string() })), data: z.array(z.array(z.unknown())) });
export function tapRows(input: unknown): Record<string, unknown>[] {
  const parsed = parseUpstream(tapSchema, input);
  const names = parsed.metadata.map((column) => column.name.toLowerCase());
  if (new Set(names).size !== names.length || parsed.data.some((row) => row.length !== names.length)) {
    throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'Astronomy provider returned invalid table columns');
  }
  return parsed.data.map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])));
}

export const finiteNullable = z.number().finite().nullable();
export const optionalMeasurement = finiteNullable.optional().transform((v) => v ?? null);
export function adqlLiteral(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
