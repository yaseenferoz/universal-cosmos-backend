# Scientific data sources

The API serves stored catalogue records. Only the ephemeris service makes an on-demand external astronomy request, and successful ephemeris responses use a bounded, in-process TTL cache. Media and catalogue imports are explicit, bounded CLI jobs. There is no per-frame provider polling. Empty object categories remain empty until real records are ingested; no runtime mock catalogue is supplied.

Documentation and provider formats were checked on 2026-11-02. Tests use synthetic fixtures in `tests/` and never require astronomy services. Small live probes additionally verified NASA image search, Gaia DR3 JSON rows, Exoplanet Archive ordered JSON batches and the SIMBAD official mirror's schema and identification output. Service availability and scientific catalogue contents can change independently of this code.

## NASA JPL Horizons

- Official [API reference](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html).
- Fixed server-side endpoint: `https://ssd.jpl.nasa.gov/api/horizons.api`.
- The seed stores attributed real object identities and JPL target identifiers for the Sun, eight planets and the Moon. It does not fabricate physical measurements.
- Ephemerides use geometric state vectors with explicit center, frame, reference plane, TDB time scale, positions in km and velocities in km/s. They are separate from stored catalogue orbital elements. Refer to the API documentation for supported query ranges and step sizes.
- Preserve JPL attribution and response-version information. The service bounds request duration, response size and output samples, and serializes JPL requests within each process. Run one ephemeris process unless shared upstream concurrency control is added. Cache contents are lost on restart.

## NASA Image and Video Library

- Official [API documentation](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf), [media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- Fixed endpoint: `https://images-api.nasa.gov/search`; adapter supports image, video and audio selection.
- Stored asset metadata includes NASA identifier, title, public source page, validated NASA-hosted preview URL when present, credits, description, date and import timestamp. Original media bytes are not downloaded or claimed as locally hosted.
- NASA media is not assigned a blanket public-domain license. Stored licensing text points to NASA guidance and retains the possibility of item-specific third-party rights. Review item credits before redistribution. Source descriptions and reference strings are untrusted text; consumers must escape them when rendering HTML.

## ESA Gaia DR3

- Official [programmatic access](https://www.cosmos.esa.int/web/gaia-users/archive/programmatic-access), [Gaia source data model](https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html), [acknowledgement and citation guidance](https://gea.esac.esa.int/archive/documentation/credits.html).
- Fixed TAP endpoint: `https://gea.esac.esa.int/tap-server/tap/sync`; table `gaiadr3.gaia_source`.
- Each batch uses a source-ID cursor, `TOP <= 500`, an explicit maximum G magnitude, a sky cone no larger than 5 degrees, non-null parallax and stellar classification probability >= 0.9. This is a selected stellar subset, not a complete or statistically unbiased sample. Default cone is RA 0 degrees, Dec 0 degrees, radius 1 degree; choose the region explicitly for your application.
- Exact 64-bit source identifiers are read from Gaia's documented textual `designation`; they never pass through JavaScript number conversion. Numeric cursor strings are restricted to signed 64-bit positive identifiers.
- Preserve RA/Dec (deg), their errors (mas), parallax/error (mas), proper motions/errors (mas/yr), radial velocity/error (km/s), G/BP/RP photometry (mag), mean fluxes/errors (electron/s), ICRS and Julian reference epoch in TCB. RA errors and RA proper motion follow Gaia's cos(declination) convention.
- Negative parallaxes remain negative. No inverse-parallax distance is computed. Missing measurements remain null. Core astrometry and magnitudes occupy typed columns; auxiliary flux measurements retain named units in structured metadata.
- Source license is null where no specific dataset license is asserted; attribution and official citation guidance are retained. Gaia credits and relevant release papers must accompany scientific reuse.

## NASA Exoplanet Archive

- Official [TAP guide](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html), [PS column definitions](https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html), [acknowledgements](https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html).
- Fixed endpoint: `https://exoplanetarchive.ipac.caltech.edu/TAP/sync`; table `ps`, `default_flag=1`, confirmed solution dispositions only. The source table, host name, archive row-update date and parameter reference are retained.
- Keyset pagination orders by `pl_name` and limits with TAP `MAXREC <= 500`. This is intentional: a live check found this service applies `TOP` before `ORDER BY`, which would skip records during name-cursor pagination. MAXREC returns the correctly ordered bounded result.
- Masses retain `M_jup`, radii `R_jup`, temperature K, semi-major axes au, periods day, angles deg and distances pc. These are the archive's units, not silently converted SI values. Signed upper/lower uncertainties and limit flags are retained with the measurement.
- `pl_bmassj` may represent mass or M sin(i). The physical `mass` column is populated only when provenance says `Mass`; other estimates and their errors remain in `bestMassEstimate` with provenance. `pl_eqt` is equilibrium temperature, but may be effective temperature for directly imaged planets. Semi-major axis can represent projected separation for imaging/microlensing. Published periapsis angles can refer to planet or host reflex motion and differ by 180 degrees; the adapter does not standardize them.
- No osculating orbital epoch or dynamical frame is invented. Source coordinates are J2000 equatorial values; a measurement epoch is not supplied. Host names are metadata, without automatic cross-catalogue merging or inferred parent records.

## SIMBAD

- Official [TAP service on the Harvard mirror](https://simbad.cfa.harvard.edu/simbad/sim-tap/), [capabilities](https://simbad.cfa.harvard.edu/simbad/sim-tap/capabilities), [table schema](https://simbad.cfa.harvard.edu/simbad/sim-tap/tables), [SIMBAD introduction](https://simbad.cds.unistra.fr/Pages/guide/ch02.htx).
- The main CDS documentation returned access errors during verification. The official mirror's current machine-readable capabilities and tables were successfully inspected, and its JSON response was verified before implementation.
- Fixed endpoint: `https://simbad.cfa.harvard.edu/simbad/sim-tap/sync`. A validated exact identifier joins `ident.oidref` to `basic.oid`, returning main identifier, original SIMBAD object type, aliases, ICRS J2000 coordinates and coordinate bibliography. At most 100 aliases are returned; possible truncation is explicit.
- ADQL literals are escaped; neither caller-supplied SQL nor provider URLs are accepted. No approximate positional cross-match automatically merges objects. Identification is currently a provider/CLI operation, not a public mutation endpoint.

## Ingestion and refresh operations

After database migration and seed, run from the repository root with a configured `DATABASE_URL`:

```sh
npm run ingest -- --help
npm run ingest -- gaia --max-magnitude 12 --ra 45 --dec 0 --radius 1 --limit 500
npm run ingest -- exoplanets --limit 500
npm run ingest -- nasa-media --object-id <local-object-uuid> --query Saturn --limit 25
npm run ingest -- simbad --identifier "M 31"
```

| Flag | Commands | Meaning |
| --- | --- | --- |
| `--limit` | Gaia, exoplanets | Maximum total records for this run, 1–10,000, default 100; internally batches are at most 100 rows |
| `--cursor` | Gaia, exoplanets | Exact `nextCursor` from the previous successful run, with identical selection filters |
| `--max-magnitude` | Gaia | Required upper G magnitude, -5 to 15 |
| `--ra`, `--dec` | Gaia | Cone center in ICRS degrees, default 0, 0 |
| `--radius` | Gaia | Cone radius in degrees, greater than 0 and at most 5, default 1 |
| `--object-id` | NASA media | Existing local celestial object UUID to associate with search results |
| `--query` | NASA media | Search phrase, 2–120 characters; review the phrase/object association before importing |
| `--limit` | NASA media | Maximum first-page assets, 1–100, default 100 |
| `--identifier` | SIMBAD | Exact identifier, 1–120 characters; logs the result without mutating objects |

All worker commands run once and exit. Start with manual imports, then schedule the same commands with Windows Task Scheduler or cron as appropriate for the deployment. A reasonable initial policy is daily exoplanet refresh and monthly selected Gaia region refresh; source release changes require review. Do not overlap imports for the same catalogue/selection. Begin each full refresh without a cursor; only use cursors to resume a traversal. The database does not automatically delete objects that disappear from upstream results.

Each object's import is a database transaction. Source identities and references are upserted; this catalogue's coordinate/orbital snapshot is replaced while other source snapshots remain. A failing object rolls back without invalidating earlier imported objects. Rerunning is idempotent. Preserve the previous successful cursor until the next complete job succeeds; retrying may revisit rows safely. Import timestamps identify freshness; this first version does not retain a complete measurement history.

No ingestion runs automatically when the HTTP server starts. Provider failures produce explicit errors and never silently substitute sample data. Adapters can be replaced behind their interfaces without changing the public read API. Keep one scheduler responsible for refreshes; a distributed queue is deliberately outside this version.
