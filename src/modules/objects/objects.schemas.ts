import { z } from 'zod';

export const objectTypes = ['PLANET', 'MOON', 'STAR', 'GALAXY', 'NEBULA', 'EXOPLANET', 'SMALL_BODY'] as const;
export const objectIdSchema = z.uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const objectListSchema = paginationSchema.extend({
  objectType: z.enum(objectTypes).optional(),
  parentObjectId: objectIdSchema.optional(),
}).strict();
export type ListInput = z.infer<typeof objectListSchema> & { q?: string };
