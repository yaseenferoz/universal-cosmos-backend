import { horizonsInputSchema } from '../../integrations/nasa/horizons/index.js';
import type { EphemerisResult } from '../../integrations/types.js';
import { AppError } from '../../utils/errors.js';
import type { ObjectService } from '../objects/objects.service.js';

export interface EphemerisProvider { getEphemeris(input: unknown): Promise<EphemerisResult> }
export class EphemerisService {
  constructor(private readonly objects: ObjectService, private readonly provider: EphemerisProvider) {}
  async get(id: string, query: unknown) {
    // Validate the full date range before database or upstream work.
    const validated = horizonsInputSchema.parse({ ...(query as Record<string, unknown>), targetId: '0' });
    const object = await this.objects.getRecord(id);
    const targetId = object.sourceCatalog === 'JPL_HORIZONS' ? object.sourceCatalogId :
      object.sourceReferences.find(ref => ref.scientificSource.name === 'JPL Horizons')?.externalIdentifier;
    if (!targetId) throw new AppError(422, 'EPHEMERIS_NOT_SUPPORTED', 'No JPL Horizons identifier is registered for this object');
    const result = await this.provider.getEphemeris({ ...validated, targetId });
    return { objectId: id, ...result };
  }
}
