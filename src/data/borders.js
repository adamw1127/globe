// Border source module. Everything the app knows about borders goes through
// these functions, so the source (currently historical-basemaps snapshots
// built by scripts/build-borders.mjs) can be swapped without touching the UI.
//
// A snapshot is a GeoJSON FeatureCollection whose features carry:
//   NAME    territory name as drawn on the map
//   ENTITY  data entity code (ISO3, historical key, "PART:<ISO3>" or null)
//   RULER   ruling power when the territory is subject to another, else null
import { fetchJSON } from './fetchJSON.js';

export async function loadBorderIndex() {
  const index = await fetchJSON('data/borders/index.json');
  return { snapshots: index.snapshots, source: index.source };
}

// Closest snapshot to the year. Ties go to the earlier snapshot.
export function nearestSnapshot(snapshots, year) {
  let best = snapshots[0];
  for (const s of snapshots) {
    if (Math.abs(s - year) < Math.abs(best - year)) best = s;
  }
  return best;
}

export async function loadSnapshot(snapshotYear) {
  const gj = await fetchJSON(`data/borders/world_${snapshotYear}.json`);
  return gj?.features ?? [];
}
