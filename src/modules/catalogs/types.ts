export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface CatalogSource {
  name: string; provider: string; sourceUrl: string; license: string | null;
  attribution: string; dataVersion: string | null;
}
export interface CatalogObject {
  name: string; sourceCatalog: string; sourceCatalogId: string; objectType: 'STAR' | 'EXOPLANET';
  source: CatalogSource;
  coordinates: {
    rightAscension: number | null; declination: number | null; angleUnit: string;
    coordinateFrame: string; epoch: number | null; epochFormat: string; source: string;
    rightAscensionError?: number | null; declinationError?: number | null; positionErrorUnit?: string;
    distance?: number | null; distanceUnit?: string; parallax?: number | null; parallaxError?: number | null;
    parallaxUnit?: string; properMotionRa?: number | null; properMotionDec?: number | null;
    properMotionRaError?: number | null; properMotionDecError?: number | null; properMotionUnit?: string;
    radialVelocity?: number | null; radialVelocityError?: number | null; radialVelocityUnit?: string;
    uncertaintyJson?: { [key: string]: JsonValue };
  };
  physical: {
    mass?: number | null; massUnit?: string; radius?: number | null; radiusUnit?: string;
    temperature?: number | null; temperatureUnit?: string; photometricG?: number | null;
    photometricBp?: number | null; photometricRp?: number | null; photometryUnit?: string;
    source: string; propertiesJson?: { [key: string]: JsonValue }; uncertaintyJson?: { [key: string]: JsonValue };
  };
  orbital?: {
    semiMajorAxis: number | null; semiMajorAxisUnit: string; eccentricity: number | null;
    inclination: number | null; argumentOfPeriapsis: number | null; angleUnit: string;
    orbitalPeriod: number | null; orbitalPeriodUnit: string; source: string;
    uncertaintyJson: { [key: string]: JsonValue };
  };
}
export interface CatalogBatch { objects: CatalogObject[]; nextCursor: string | null }
export interface MediaAsset {
  externalIdentifier: string; assetType: 'IMAGE' | 'VIDEO' | 'AUDIO'; title: string;
  sourceUrl: string; previewUrl: string | null; attribution: string; license: string;
  description: string | null; dateCreated: string | null;
}
