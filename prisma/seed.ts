import 'dotenv/config';
import { createPrismaClient } from '../src/database/client.js';
import { horizonsIdentitySource, solarSystemIdentities } from '../src/database/seed-data.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the database');
const prisma = createPrismaClient(databaseUrl);

try {
  await prisma.$transaction(async (tx) => {
    const source = await tx.scientificSource.upsert({
      where: { name: horizonsIdentitySource.name },
      create: horizonsIdentitySource,
      update: horizonsIdentitySource,
    });
    const identifiers = new Map<string, string>();
    for (const item of solarSystemIdentities) {
      const parentObjectId = item.parentSlug ? identifiers.get(item.parentSlug) : null;
      if (item.parentSlug && !parentObjectId) throw new Error('Seed parent must precede its child');
      const record = {
        name: item.name,
        slug: item.slug,
        objectType: item.objectType,
        parentObjectId: parentObjectId ?? null,
        sourceCatalog: 'JPL_HORIZONS',
        sourceCatalogId: item.horizonsId,
        description: `${item.name}: Solar System identity record. Scientific measurements are populated separately from attributed provider data.`,
      };
      const object = await tx.celestialObject.upsert({
        where: { slug: item.slug }, create: record, update: record,
      });
      identifiers.set(item.slug, object.id);
      await tx.objectSourceReference.upsert({
        where: {
          objectId_scientificSourceId_externalIdentifier: {
            objectId: object.id, scientificSourceId: source.id, externalIdentifier: item.horizonsId,
          },
        },
        create: { objectId: object.id, scientificSourceId: source.id, externalIdentifier: item.horizonsId },
        update: { importedAt: new Date() },
      });
    }
  });
  process.stdout.write('Seeded 10 attributed Solar System identity records; no measurements were invented.\n');
} catch {
  process.stderr.write('Database seed failed. Check the connection and applied migrations.\n');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
