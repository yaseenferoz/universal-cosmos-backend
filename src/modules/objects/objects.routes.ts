import { Router } from 'express';
import type { ObjectType } from '@prisma/client';
import { getObject, listObjects } from './objects.controller.js';
import type { ObjectService } from './objects.service.js';
export function createObjectRouter(service: ObjectService) {
  const router = Router();
  router.get('/', listObjects(service));
  router.get('/:id', getObject(service));
  return router;
}
export function createTypedObjectRouter(service: ObjectService, type: ObjectType) {
  const router = Router(); router.get('/', listObjects(service, type)); return router;
}
