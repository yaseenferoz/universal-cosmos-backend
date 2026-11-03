export interface ScientificProvenance {
  provider: string;
  sourceUrl: string;
  dataVersion: string | null;
  retrievedAt: string;
  attribution: string;
}

export interface VectorSample {
  julianDateTdb: number;
  calendarDateTdb: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
}

export interface EphemerisResult {
  targetId: string;
  center: string;
  timeScale: 'TDB';
  referenceFrame: 'ICRF';
  referencePlane: 'FRAME';
  correction: 'NONE';
  units: { position: 'km'; velocity: 'km/s'; epoch: 'Julian day (TDB)' };
  start: string;
  stop: string;
  step: string;
  samples: VectorSample[];
  source: ScientificProvenance;
}
