-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('PLANET', 'MOON', 'STAR', 'GALAXY', 'NEBULA', 'EXOPLANET', 'SMALL_BODY');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'MODEL', 'DOCUMENT');

-- CreateTable
CREATE TABLE "CelestialObject" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "objectType" "ObjectType" NOT NULL,
    "description" TEXT,
    "parentObjectId" UUID,
    "sourceCatalog" VARCHAR(100),
    "sourceCatalogId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CelestialObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalProperties" (
    "id" UUID NOT NULL,
    "objectId" UUID NOT NULL,
    "mass" DOUBLE PRECISION,
    "massUnit" VARCHAR(30) NOT NULL DEFAULT 'kg',
    "radius" DOUBLE PRECISION,
    "radiusUnit" VARCHAR(30) NOT NULL DEFAULT 'km',
    "diameter" DOUBLE PRECISION,
    "diameterUnit" VARCHAR(30) NOT NULL DEFAULT 'km',
    "density" DOUBLE PRECISION,
    "densityUnit" VARCHAR(30) NOT NULL DEFAULT 'kg/m3',
    "temperature" DOUBLE PRECISION,
    "temperatureUnit" VARCHAR(30) NOT NULL DEFAULT 'K',
    "luminosity" DOUBLE PRECISION,
    "luminosityUnit" VARCHAR(30) NOT NULL DEFAULT 'W',
    "spectralClass" VARCHAR(100),
    "photometricG" DOUBLE PRECISION,
    "photometricBp" DOUBLE PRECISION,
    "photometricRp" DOUBLE PRECISION,
    "photometryUnit" VARCHAR(30) NOT NULL DEFAULT 'mag',
    "propertiesJson" JSONB,
    "uncertaintyJson" JSONB,
    "source" VARCHAR(255),

    CONSTRAINT "PhysicalProperties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrbitalElements" (
    "id" UUID NOT NULL,
    "objectId" UUID NOT NULL,
    "semiMajorAxis" DOUBLE PRECISION,
    "semiMajorAxisUnit" VARCHAR(30) NOT NULL DEFAULT 'au',
    "eccentricity" DOUBLE PRECISION,
    "inclination" DOUBLE PRECISION,
    "longitudeAscendingNode" DOUBLE PRECISION,
    "argumentOfPeriapsis" DOUBLE PRECISION,
    "meanAnomaly" DOUBLE PRECISION,
    "angleUnit" VARCHAR(30) NOT NULL DEFAULT 'deg',
    "orbitalPeriod" DOUBLE PRECISION,
    "orbitalPeriodUnit" VARCHAR(30) NOT NULL DEFAULT 'day',
    "epoch" DOUBLE PRECISION,
    "epochFormat" VARCHAR(30) NOT NULL DEFAULT 'JD',
    "timeScale" VARCHAR(30),
    "referenceFrame" VARCHAR(100),
    "source" VARCHAR(255) NOT NULL,
    "uncertaintyJson" JSONB,

    CONSTRAINT "OrbitalElements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coordinates" (
    "id" UUID NOT NULL,
    "objectId" UUID NOT NULL,
    "rightAscension" DOUBLE PRECISION,
    "declination" DOUBLE PRECISION,
    "angleUnit" VARCHAR(30) NOT NULL DEFAULT 'deg',
    "rightAscensionError" DOUBLE PRECISION,
    "declinationError" DOUBLE PRECISION,
    "positionErrorUnit" VARCHAR(30) NOT NULL DEFAULT 'mas',
    "distance" DOUBLE PRECISION,
    "distanceUnit" VARCHAR(30) NOT NULL DEFAULT 'pc',
    "distanceError" DOUBLE PRECISION,
    "parallax" DOUBLE PRECISION,
    "parallaxError" DOUBLE PRECISION,
    "parallaxUnit" VARCHAR(30) NOT NULL DEFAULT 'mas',
    "properMotionRa" DOUBLE PRECISION,
    "properMotionDec" DOUBLE PRECISION,
    "properMotionRaError" DOUBLE PRECISION,
    "properMotionDecError" DOUBLE PRECISION,
    "properMotionUnit" VARCHAR(30) NOT NULL DEFAULT 'mas/yr',
    "radialVelocity" DOUBLE PRECISION,
    "radialVelocityError" DOUBLE PRECISION,
    "radialVelocityUnit" VARCHAR(30) NOT NULL DEFAULT 'km/s',
    "epoch" DOUBLE PRECISION,
    "epochFormat" VARCHAR(30) NOT NULL DEFAULT 'Julian year',
    "coordinateFrame" VARCHAR(100) NOT NULL,
    "source" VARCHAR(255) NOT NULL,
    "uncertaintyJson" JSONB,

    CONSTRAINT "Coordinates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScientificSource" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(255) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "license" TEXT,
    "attribution" TEXT NOT NULL,
    "dataVersion" VARCHAR(100),

    CONSTRAINT "ScientificSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectSourceReference" (
    "id" UUID NOT NULL,
    "objectId" UUID NOT NULL,
    "scientificSourceId" UUID NOT NULL,
    "externalIdentifier" VARCHAR(255) NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "objectId" UUID NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "storageKey" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "attribution" TEXT NOT NULL,
    "license" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CelestialObject_slug_key" ON "CelestialObject"("slug");

-- CreateIndex
CREATE INDEX "CelestialObject_objectType_name_id_idx" ON "CelestialObject"("objectType", "name", "id");

-- CreateIndex
CREATE INDEX "CelestialObject_parentObjectId_idx" ON "CelestialObject"("parentObjectId");

-- CreateIndex
CREATE INDEX "CelestialObject_name_idx" ON "CelestialObject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CelestialObject_sourceCatalog_sourceCatalogId_key" ON "CelestialObject"("sourceCatalog", "sourceCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalProperties_objectId_key" ON "PhysicalProperties"("objectId");

-- CreateIndex
CREATE INDEX "OrbitalElements_objectId_source_idx" ON "OrbitalElements"("objectId", "source");

-- CreateIndex
CREATE INDEX "Coordinates_objectId_source_idx" ON "Coordinates"("objectId", "source");

-- CreateIndex
CREATE INDEX "Coordinates_rightAscension_declination_idx" ON "Coordinates"("rightAscension", "declination");

-- CreateIndex
CREATE UNIQUE INDEX "ScientificSource_name_key" ON "ScientificSource"("name");

-- CreateIndex
CREATE INDEX "ObjectSourceReference_scientificSourceId_externalIdentifier_idx" ON "ObjectSourceReference"("scientificSourceId", "externalIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectSourceReference_objectId_scientificSourceId_externalI_key" ON "ObjectSourceReference"("objectId", "scientificSourceId", "externalIdentifier");

-- CreateIndex
CREATE INDEX "Asset_objectId_assetType_idx" ON "Asset"("objectId", "assetType");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectId_sourceUrl_key" ON "Asset"("objectId", "sourceUrl");

-- AddForeignKey
ALTER TABLE "CelestialObject" ADD CONSTRAINT "CelestialObject_parentObjectId_fkey" FOREIGN KEY ("parentObjectId") REFERENCES "CelestialObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalProperties" ADD CONSTRAINT "PhysicalProperties_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CelestialObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrbitalElements" ADD CONSTRAINT "OrbitalElements_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CelestialObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coordinates" ADD CONSTRAINT "Coordinates_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CelestialObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectSourceReference" ADD CONSTRAINT "ObjectSourceReference_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CelestialObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectSourceReference" ADD CONSTRAINT "ObjectSourceReference_scientificSourceId_fkey" FOREIGN KEY ("scientificSourceId") REFERENCES "ScientificSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CelestialObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
