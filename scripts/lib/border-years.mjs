// Which border map a year uses, shared by the data scripts and the app.
// Years inside `index.yearly` (CShapes) get their own map; other years use
// the latest snapshot at or before them (the first one for earlier years).
// A later map could show states that did not exist yet, such as post-Soviet
// borders in 1980; an earlier one can only lag behind changes.
export function mapYearFor(index, year) {
  const y = index.yearly;
  if (y && year >= y.from && year <= y.to) return year;
  let best = index.snapshots[0];
  for (const s of index.snapshots) if (s <= year) best = s;
  return best;
}

export const isYearlyMap = (index, mapYear) => Boolean(index.yearly && mapYear >= index.yearly.from && mapYear <= index.yearly.to);

// Features of the yearly file shown in one year.
export const featuresInYear = (features, year) => features.filter((f) => f.properties.Y0 <= year && year <= f.properties.Y1);
