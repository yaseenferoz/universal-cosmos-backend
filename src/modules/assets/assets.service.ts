import type { AssetRepository } from './assets.repository.js';
import { AppError } from '../../utils/errors.js';
export class AssetService {
  constructor(private readonly repository: AssetRepository) {}
  async get(id: string) {
    const asset = await this.repository.findById(id);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    return { id: asset.id, objectId: asset.objectId, assetType: asset.assetType, title: asset.title, sourceUrl: asset.sourceUrl, attribution: asset.attribution, license: asset.license, metadata: asset.metadataJson };
  }
}
