import { Router } from 'express';
import type { ObjectService } from './modules/objects/objects.service.js';
import type { AssetService } from './modules/assets/assets.service.js';
import { createObjectRouter } from './modules/objects/objects.routes.js';
import { createRouter as planets } from './modules/planets/planets.routes.js';
import { createRouter as moons } from './modules/moons/moons.routes.js';
import { createRouter as stars } from './modules/stars/stars.routes.js';
import { createRouter as galaxies } from './modules/galaxies/galaxies.routes.js';
import { createRouter as nebulae } from './modules/nebulae/nebulae.routes.js';
import { createRouter as exoplanets } from './modules/exoplanets/exoplanets.routes.js';
import { createSolarSystemRouter } from './modules/solar-system/solar-system.routes.js';
import { createSearchRouter } from './modules/search/search.routes.js';
import { createAssetRouter } from './modules/assets/assets.routes.js';
import { createEphemerisRouter } from './modules/ephemeris/ephemeris.routes.js';
import type { EphemerisService } from './modules/ephemeris/ephemeris.service.js';

export interface ApiServices { objects: ObjectService; assets: AssetService; ephemeris?: EphemerisService }
export function createApiRouter(services: ApiServices) {
  const router = Router();
  router.use('/objects', createObjectRouter(services.objects));
  router.use('/planets', planets(services.objects));
  router.use('/moons', moons(services.objects));
  router.use('/stars', stars(services.objects));
  router.use('/galaxies', galaxies(services.objects));
  router.use('/nebulae', nebulae(services.objects));
  router.use('/exoplanets', exoplanets(services.objects));
  router.use('/systems', createSolarSystemRouter(services.objects));
  router.use('/search', createSearchRouter(services.objects));
  router.use('/assets', createAssetRouter(services.assets));
  if (services.ephemeris) router.use('/ephemeris', createEphemerisRouter(services.ephemeris));
  return router;
}
