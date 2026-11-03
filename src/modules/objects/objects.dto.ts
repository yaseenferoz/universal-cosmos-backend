import type { ObjectRecord, ObjectSummaryRecord } from './objects.repository.js';

function measurement(value: number | null, unit: string, uncertainty: number | null = null) {
  return value === null ? null : { value, unit, uncertainty };
}
export function objectSummary(object: ObjectSummaryRecord) {
  return { id: object.id, name: object.name, slug: object.slug, objectType: object.objectType, description: object.description, parentObjectId: object.parentObjectId, catalogue: object.sourceCatalog ? { name: object.sourceCatalog, identifier: object.sourceCatalogId } : null };
}
export function objectDetail(object: ObjectRecord) {
  const p = object.physicalProperties;
  return {
    ...objectSummary(object),
    updatedAt: object.updatedAt.toISOString(),
    relatedRecords: {
      orbitalElements: { total: object._count.orbitalElements, returned: object.orbitalElements.length },
      coordinates: { total: object._count.coordinates, returned: object.coordinates.length },
      sources: { total: object._count.sourceReferences, returned: object.sourceReferences.length },
      assets: { total: object._count.assets, returned: object.assets.length },
    },
    physicalProperties: p ? {
      mass: measurement(p.mass, p.massUnit), radius: measurement(p.radius, p.radiusUnit), diameter: measurement(p.diameter, p.diameterUnit),
      density: measurement(p.density, p.densityUnit), temperature: measurement(p.temperature, p.temperatureUnit), luminosity: measurement(p.luminosity, p.luminosityUnit),
      spectralClass: p.spectralClass, photometry: { g: measurement(p.photometricG, p.photometryUnit), bp: measurement(p.photometricBp, p.photometryUnit), rp: measurement(p.photometricRp, p.photometryUnit) },
      source: p.source, uncertainties: p.uncertaintyJson, additionalProperties: p.propertiesJson,
    } : null,
    orbitalElements: object.orbitalElements.map(o => ({
      semiMajorAxis: measurement(o.semiMajorAxis, o.semiMajorAxisUnit), eccentricity: measurement(o.eccentricity, 'dimensionless'),
      inclination: measurement(o.inclination, o.angleUnit), longitudeAscendingNode: measurement(o.longitudeAscendingNode, o.angleUnit),
      argumentOfPeriapsis: measurement(o.argumentOfPeriapsis, o.angleUnit), meanAnomaly: measurement(o.meanAnomaly, o.angleUnit),
      period: measurement(o.orbitalPeriod, o.orbitalPeriodUnit), epoch: o.epoch === null ? null : { value: o.epoch, format: o.epochFormat, timeScale: o.timeScale },
      referenceFrame: o.referenceFrame, source: o.source, uncertainties: o.uncertaintyJson,
    })),
    coordinates: object.coordinates.map(c => ({
      rightAscension: measurement(c.rightAscension, c.angleUnit), declination: measurement(c.declination, c.angleUnit),
      positionUncertainty: { rightAscension: measurement(c.rightAscensionError, c.positionErrorUnit), declination: measurement(c.declinationError, c.positionErrorUnit) },
      distance: measurement(c.distance, c.distanceUnit, c.distanceError), parallax: measurement(c.parallax, c.parallaxUnit, c.parallaxError),
      properMotion: { raCosDec: measurement(c.properMotionRa, c.properMotionUnit, c.properMotionRaError), dec: measurement(c.properMotionDec, c.properMotionUnit, c.properMotionDecError) },
      radialVelocity: measurement(c.radialVelocity, c.radialVelocityUnit, c.radialVelocityError),
      epoch: c.epoch === null ? null : { value: c.epoch, format: c.epochFormat }, coordinateFrame: c.coordinateFrame, source: c.source, uncertainties: c.uncertaintyJson,
    })),
    sources: object.sourceReferences.map(ref => ({ name: ref.scientificSource.name, provider: ref.scientificSource.provider, url: ref.scientificSource.sourceUrl, license: ref.scientificSource.license, attribution: ref.scientificSource.attribution, dataVersion: ref.scientificSource.dataVersion, externalIdentifier: ref.externalIdentifier, importedAt: ref.importedAt.toISOString() })),
    assets: object.assets.map(asset => ({ id: asset.id, assetType: asset.assetType, title: asset.title, sourceUrl: asset.sourceUrl, attribution: asset.attribution, license: asset.license })),
  };
}
