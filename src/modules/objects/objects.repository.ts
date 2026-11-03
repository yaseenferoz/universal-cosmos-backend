import { Prisma, type PrismaClient } from '@prisma/client';
import type { ListInput } from './objects.schemas.js';

export const objectDetailInclude = {
  _count: { select: { orbitalElements: true, coordinates: true, sourceReferences: true, assets: true } },
  physicalProperties: true,
  orbitalElements: { orderBy: { id: 'asc' }, take: 100 },
  coordinates: { orderBy: { id: 'asc' }, take: 100 },
  sourceReferences: { include: { scientificSource: true }, orderBy: { id: 'asc' }, take: 100 },
  assets: { orderBy: { id: 'asc' }, take: 100 },
} satisfies Prisma.CelestialObjectInclude;
export type ObjectRecord = Prisma.CelestialObjectGetPayload<{ include: typeof objectDetailInclude }>;
export type ObjectSummaryRecord = Prisma.CelestialObjectGetPayload<Record<string, never>>;
export interface ObjectRepository {
  list(input: ListInput): Promise<{ items: ObjectSummaryRecord[]; total: number }>;
  findById(id: string): Promise<ObjectRecord | null>;
  solarSystem(): Promise<ObjectSummaryRecord[]>;
}

export function createObjectRepository(db: PrismaClient): ObjectRepository {
  return {
    async list(input) {
      const literal = input.q?.replace(/[\\%_]/g, '\\$&');
      const where: Prisma.CelestialObjectWhereInput = {
        objectType: input.objectType,
        parentObjectId: input.parentObjectId,
        ...(literal ? { OR: [
          { name: { contains: literal, mode: 'insensitive' } },
          { slug: { contains: literal, mode: 'insensitive' } },
          { sourceReferences: { some: { externalIdentifier: { contains: literal, mode: 'insensitive' } } } },
        ] } : {}),
      };
      const [items, total] = await db.$transaction([
        db.celestialObject.findMany({ where, skip: (input.page - 1) * input.pageSize, take: input.pageSize, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
        db.celestialObject.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { items, total };
    },
    findById: id => db.celestialObject.findUnique({ where: { id }, include: objectDetailInclude }),
    async solarSystem() {
      // Rooted hierarchy avoids depending on the provenance of child objects.
      const ids = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        WITH RECURSIVE system AS (
          SELECT id, ARRAY[id] AS path FROM "CelestialObject" WHERE slug = 'sun' AND "objectType" = 'STAR'
          UNION ALL
          SELECT child.id, system.path || child.id FROM "CelestialObject" child
          JOIN system ON child."parentObjectId" = system.id
          WHERE NOT child.id = ANY(system.path) AND cardinality(system.path) < 8
        ) SELECT id FROM system ORDER BY id LIMIT 1001
      `);
      if (ids.length > 1000) throw new Error('Solar System exceeds configured result limit');
      return db.celestialObject.findMany({ where: { id: { in: ids.map(item => item.id) } }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    },
  };
}
