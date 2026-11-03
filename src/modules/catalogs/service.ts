import { z } from 'zod';
import type { CatalogBatch } from './types.js';
import type { CatalogRepository } from './repository.js';
import { AppError } from '../../utils/errors.js';

const ingestionSchema = z.object({ maxRows: z.number().int().min(1).max(10000).default(100), batchSize: z.number().int().min(1).max(500).default(100), cursor: z.string().optional() });
export interface BatchFetcher { (limit: number, cursor?: string): Promise<CatalogBatch> }
export class CatalogIngestionService {
  constructor(private readonly repository: CatalogRepository) {}
  async ingest(fetchBatch: BatchFetcher, input: z.input<typeof ingestionSchema> = {}) {
    const settings = ingestionSchema.parse(input);
    let imported = 0;
    let cursor = settings.cursor;
    const seenCursors = new Set<string>(cursor ? [cursor] : []);
    while (imported < settings.maxRows) {
      const requested = Math.min(settings.batchSize, settings.maxRows - imported);
      const batch = await fetchBatch(requested, cursor);
      if (batch.objects.length > requested || (batch.nextCursor !== null && (batch.objects.length === 0 || seenCursors.has(batch.nextCursor)))) {
        throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'Catalogue provider returned an invalid batch or cursor');
      }
      for (const object of batch.objects) { await this.repository.saveObject(object); imported++; }
      if (batch.nextCursor === null) return { imported, nextCursor: null, exhausted: true };
      cursor = batch.nextCursor;
      seenCursors.add(cursor);
    }
    return { imported, nextCursor: cursor ?? null, exhausted: false };
  }
}
