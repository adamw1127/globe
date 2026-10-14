// Border source module. Everything the app knows about borders goes through
// these functions, so the sources (built by scripts/build-borders.mjs) can be
// swapped without touching the UI.
//
// Every feature carries:
//   NAME    territory name as drawn on the map
//   ENTITY  data entity code (ISO3, historical key, "PART:<ISO3>" or null)
//   RULER   ruling power when the territory is subject to another, else null
// Yearly features (1886 on) also carry Y0 and Y1, the years they apply to.
import { feature } from 'topojson-client';
import { fetchJSON } from './fetchJSON.js';
import { mapYearFor, isYearlyMap, featuresInYear } from '../../scripts/lib/border-years.mjs';

export { mapYearFor, isYearlyMap };

export async function loadBorderIndex() {
  return fetchJSON('data/borders/index.json');
}

let yearly;
function loadYearly(index) {
  yearly ??= fetchJSON(`data/borders/${index.yearly.file}`).then((topo) => {
    const features = feature(topo, topo.objects[Object.keys(topo.objects)[0]]).features;
    // Decoded rings follow the TopoJSON winding mapshaper wrote (clockwise
    // outer rings), which is what three-globe expects.
    return features;
  });
  return yearly;
}

// Each year's feature list is built once, so the same objects are reused
// when the year comes back and the globe can keep their meshes.
const byYear = new Map();
export function loadBorders(index, mapYear) {
  if (!byYear.has(mapYear)) {
    byYear.set(
      mapYear,
      isYearlyMap(index, mapYear)
        ? loadYearly(index).then((all) => featuresInYear(all, mapYear))
        : fetchJSON(`data/borders/world_${mapYear}.json`).then((gj) => gj?.features ?? []),
    );
  }
  return byYear.get(mapYear);
}

// Land drawn under every map: shows land that no state on the map covers.
let land;
export function loadLand(index) {
  land ??= index.land ? fetchJSON(`data/borders/${index.land}`).then((gj) => gj?.features ?? []) : Promise.resolve([]);
  return land;
}
