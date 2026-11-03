import { createTypedObjectRouter } from '../objects/objects.routes.js';
import type { ObjectService } from '../objects/objects.service.js';
export const createRouter = (service: ObjectService) => createTypedObjectRouter(service, 'STAR');

