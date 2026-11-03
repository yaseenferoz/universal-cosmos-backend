// IAU 2012 B2: au exactly 149597870700 m. IAU 2015 B2: pc exactly 648000/pi au.
// Light-year uses a Julian year of 365.25 days and exact SI speed of light.
export const METERS_PER_AU = 149_597_870_700;
export const METERS_PER_PARSEC = METERS_PER_AU * 648_000 / Math.PI;
export const METERS_PER_LIGHT_YEAR = 299_792_458 * 365.25 * 86_400;
export type LengthUnit = 'm' | 'km' | 'au' | 'pc' | 'ly';
const metersPerUnit: Record<LengthUnit, number> = {
  m: 1, km: 1_000, au: METERS_PER_AU, pc: METERS_PER_PARSEC, ly: METERS_PER_LIGHT_YEAR,
};

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (!Number.isFinite(value) || !Object.hasOwn(metersPerUnit, from) || !Object.hasOwn(metersPerUnit, to)) {
    throw new RangeError('Length conversion requires a finite value and supported explicit units');
  }
  const result = value * (metersPerUnit[from] / metersPerUnit[to]);
  if (!Number.isFinite(result)) throw new RangeError('Length conversion overflow');
  return result;
}
