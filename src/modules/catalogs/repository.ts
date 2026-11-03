import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { CatalogObject, MediaAsset } from './types.js';
import { AppError } from '../../utils/errors.js';

export interface CatalogRepository {
  saveObject(object: CatalogObject): Promise<void>;
  saveMedia(objectId: string, assets: MediaAsset[]): Promise<void>;
}

function catalogSlug(object: CatalogObject): string {
  const prefix = object.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,180) || 'object';
  const suffix = createHash('sha256').update(`${object.sourceCatalog}:${object.sourceCatalogId}`).digest('hex').slice(0,16);
  return `${prefix}-${suffix}`;
}

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async saveObject(record: CatalogObject): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const source = await tx.scientificSource.upsert({ where: { name: record.source.name }, create: record.source, update: record.source });
      const identity = { sourceCatalog: record.sourceCatalog, sourceCatalogId: record.sourceCatalogId };
      const object = await tx.celestialObject.upsert({
        where: { sourceCatalog_sourceCatalogId: identity },
        create: { ...identity, name: record.name, objectType: record.objectType, slug: catalogSlug(record) },
        update: { name: record.name, objectType: record.objectType },
      });
      await tx.physicalProperties.upsert({ where: { objectId: object.id }, create: { objectId: object.id, ...record.physical }, update: record.physical });
      // Retain measurements from other catalogues; replace this catalogue's snapshot atomically.
      await tx.coordinates.deleteMany({ where: { objectId: object.id, source: record.coordinates.source } });
      await tx.coordinates.create({ data: { objectId: object.id, ...record.coordinates } });
      if (record.orbital) {
        await tx.orbitalElements.deleteMany({ where: { objectId: object.id, source: record.orbital.source } });
        await tx.orbitalElements.create({ data: { objectId: object.id, ...record.orbital } });
      }
      const reference = { objectId: object.id, scientificSourceId: source.id, externalIdentifier: record.sourceCatalogId };
      await tx.objectSourceReference.upsert({ where: { objectId_scientificSourceId_externalIdentifier: reference }, create: reference, update: { importedAt: new Date() } });
    });
  }
  async saveMedia(objectId: string, assets: MediaAsset[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!await tx.celestialObject.findUnique({ where: { id: objectId }, select: { id: true } })) throw new AppError(404, 'OBJECT_NOT_FOUND', 'Celestial object not found');
      for (const media of assets) {
        const data = {
          objectId, assetType: media.assetType, sourceUrl: media.sourceUrl, title: media.title,
          attribution: media.attribution, license: media.license,
          metadataJson: { nasaId: media.externalIdentifier, previewUrl: media.previewUrl, description: media.description, dateCreated: media.dateCreated, importedAt: new Date().toISOString() },
        };
        await tx.asset.upsert({ where: { objectId_sourceUrl: { objectId, sourceUrl: media.sourceUrl } }, create: data, update: data });
      }
    });
  }
}
