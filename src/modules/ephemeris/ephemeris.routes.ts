import { Router } from 'express';
import { objectIdSchema } from '../objects/objects.schemas.js';
import { horizonsQuerySchema } from '../../integrations/nasa/horizons/index.js';
import { success } from '../../utils/response.js';
import type { EphemerisService } from './ephemeris.service.js';
export function createEphemerisRouter(service: EphemerisService) {
  const router = Router();
  router.get('/:id', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const result = await service.get(id, horizonsQuerySchema.parse(req.query));
    res.json(success(result, { source: result.source.provider }));
  });
  return router;
}
