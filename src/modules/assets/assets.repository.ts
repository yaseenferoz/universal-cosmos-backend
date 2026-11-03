import type { Asset, PrismaClient } from '@prisma/client';
export interface AssetRepository { findById(id: string): Promise<Asset | null> }
export function createAssetRepository(db: PrismaClient): AssetRepository {
  return { findById: id => db.asset.findUnique({ where: { id } }) };
}
