import { Router } from 'express';
import { objectIdSchema } from '../objects/objects.schemas.js';
import type { AssetService } from './assets.service.js';
import { success } from '../../utils/response.js';
export function createAssetRouter(service: AssetService) {
  const router = Router(); router.get('/:id', async (req, res) => res.json(success(await service.get(objectIdSchema.parse(req.params.id))))); return router;
}
