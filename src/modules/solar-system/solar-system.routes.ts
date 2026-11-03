import { Router } from 'express';
import type { ObjectService } from '../objects/objects.service.js';
import { success } from '../../utils/response.js';
export function createSolarSystemRouter(service: ObjectService) {
  const router = Router(); router.get('/solar', async (_req, res) => res.json(success(await service.solarSystem()))); return router;
}
