import { z } from 'zod';
import { objectTypes, paginationSchema } from '../objects/objects.schemas.js';
export const searchSchema = paginationSchema.extend({
  q: z.string().trim().min(2).max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed'),
  objectType: z.enum(objectTypes).optional(),
}).strict();
