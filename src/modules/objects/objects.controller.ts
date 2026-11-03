import type { RequestHandler } from 'express';
import type { ObjectType } from '@prisma/client';
import { success } from '../../utils/response.js';
import { objectIdSchema, objectListSchema, paginationSchema } from './objects.schemas.js';
import type { ObjectService } from './objects.service.js';

export function listObjects(service: ObjectService, objectType?: ObjectType): RequestHandler {
  return async (req, res) => {
    const input = objectType ? { ...paginationSchema.strict().parse(req.query), objectType } : objectListSchema.parse(req.query);
    const result = await service.list(input);
    res.json(success(result.data, { pagination: result.pagination }));
  };
}
export function getObject(service: ObjectService): RequestHandler {
  return async (req, res) => res.json(success(await service.get(objectIdSchema.parse(req.params.id))));
}
