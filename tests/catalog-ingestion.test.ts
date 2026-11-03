import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CatalogIngestionService } from '../src/modules/catalogs/service.js';
import { PrismaCatalogRepository } from '../src/modules/catalogs/repository.js';
import { normalizeGaiaRow } from '../src/integrations/esa/gaia/provider.js';

const fixture = normalizeGaiaRow({ designation: 'Gaia DR3 999999999999999999', ra: 12, dec: -3, ref_epoch: 2016 });
describe('bounded catalogue ingestion', () => {
  it('imports sequentially, caps total rows, and emits a resumable cursor', async () => {
    const repo = { saveObject: vi.fn().mockResolvedValue(undefined), saveMedia: vi.fn() };
    const fetchBatch = vi.fn().mockResolvedValueOnce({ objects: [fixture, fixture], nextCursor: '2' }).mockResolvedValueOnce({ objects: [fixture], nextCursor: '3' });
    expect(await new CatalogIngestionService(repo).ingest(fetchBatch, { maxRows: 3, batchSize: 2 })).toEqual({ imported: 3, nextCursor: '3', exhausted: false });
    expect(fetchBatch.mock.calls).toEqual([[2, undefined], [1, '2']]);
    expect(repo.saveObject).toHaveBeenCalledTimes(3);
  });
  it('stops when a catalogue is exhausted and rejects stalled cursors', async () => {
    const repo = { saveObject: vi.fn(), saveMedia: vi.fn() };
    const service = new CatalogIngestionService(repo);
    expect(await service.ingest(async () => ({ objects: [], nextCursor: null }))).toEqual({ imported: 0, nextCursor: null, exhausted: true });
    await expect(service.ingest(async () => ({ objects: [fixture], nextCursor: 'same' }), { cursor: 'same' })).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_RESPONSE' });
    expect(repo.saveObject).not.toHaveBeenCalled();
  });
  it('does not request another batch after a persistence failure', async () => {
    const repo = { saveObject: vi.fn().mockRejectedValue(new Error('transaction rolled back')), saveMedia: vi.fn() };
    const fetchBatch = vi.fn().mockResolvedValue({ objects: [fixture], nextCursor: '1' });
    await expect(new CatalogIngestionService(repo).ingest(fetchBatch)).rejects.toThrow('transaction rolled back');
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });
});

describe('catalogue persistence', () => {
  it('uses stable identities and transactional replacement so repeated imports do not append snapshots', async () => {
    const tx = {
      scientificSource: { upsert: vi.fn().mockResolvedValue({ id: 'source-id' }) },
      celestialObject: { upsert: vi.fn().mockResolvedValue({ id: 'object-id' }) },
      physicalProperties: { upsert: vi.fn() }, coordinates: { deleteMany: vi.fn(), create: vi.fn() },
      orbitalElements: { deleteMany: vi.fn(), create: vi.fn() }, objectSourceReference: { upsert: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)) };
    const repository = new PrismaCatalogRepository(prisma as unknown as PrismaClient);
    await repository.saveObject(fixture); await repository.saveObject(fixture);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const calls = tx.celestialObject.upsert.mock.calls.map(([args]) => args);
    expect(calls[0].where).toEqual(calls[1].where);
    expect(calls[0].create.slug).toEqual(calls[1].create.slug);
    expect(tx.coordinates.deleteMany).toHaveBeenCalledWith({ where: { objectId: 'object-id', source: 'Gaia DR3' } });
    expect(tx.objectSourceReference.upsert.mock.calls[0]![0].where).toEqual(tx.objectSourceReference.upsert.mock.calls[1]![0].where);
    expect(tx.coordinates.create.mock.calls[0]![0].data.epochFormat).toBe('Julian year (TCB)');
  });
});
