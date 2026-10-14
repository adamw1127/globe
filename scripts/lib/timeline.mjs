// Year logic shared by the data scripts and the app (src/data/years.js
// mirrors it). Before `annualFrom` the timeline stops only at benchmark
// years, and each benchmark stands for the span up to the next one.

// The span of years a stop stands for: [from, to] inclusive.
export function windowFor(year, eras) {
  const { benchmarks = [], annualFrom } = eras;
  if (!annualFrom || year >= annualFrom) return [year, year];
  const i = benchmarks.indexOf(year);
  if (i === -1) return [year, year];
  const next = benchmarks[i + 1] ?? annualFrom;
  return [year, next - 1];
}

// Value for one series ({ year: value }) at a stop: the stop year itself,
// else the first year with a value inside its span.
export function valueInWindow(years, [from, to]) {
  if (!years) return undefined;
  for (let y = from; y <= to; y++) if (years[y] !== undefined && years[y] !== null) return { year: y, value: years[y] };
  return undefined;
}

// Latest-value fill: when a series has no value in the window and has
// ended before it, use its last value if it is at most `maxGap` years old.
export const CARRY_FORWARD_YEARS = 10;
export function latestBefore(years, from, maxGap = CARRY_FORWARD_YEARS) {
  if (!years) return undefined;
  let best;
  for (const k of Object.keys(years)) {
    const y = Number(k);
    if (y < from && years[k] !== null && (best === undefined || y > best)) best = y;
  }
  if (best === undefined || from - best > maxGap) return undefined;
  // Only when the series has ended: no value later than the window start.
  if (Object.keys(years).some((k) => Number(k) >= from)) return undefined;
  return { year: best, value: years[best], carried: true };
}

// Value at a stop: inside its window, else (if allowed) the latest earlier
// value of a series that has ended.
export function valueAt(years, stop, eras, { carry = true } = {}) {
  const win = windowFor(stop, eras);
  return valueInWindow(years, win) ?? (carry ? latestBefore(years, win[0]) : undefined);
}
