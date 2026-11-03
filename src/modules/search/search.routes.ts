import { Router } from 'express';
import type { ObjectService } from '../objects/objects.service.js';
import { success } from '../../utils/response.js';
import { searchSchema } from './search.schemas.js';
export function createSearchRouter(service: ObjectService) {
  const router = Router();
  router.get('/', async (req, res) => {
    const result = await service.list(searchSchema.parse(req.query));
    res.json(success(result.data, { pagination: result.pagination }));
  });
  return router;
}
