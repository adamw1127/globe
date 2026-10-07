// Same year rules as the data scripts: benchmark spans before 1820 and the
// latest-value fill for series that have ended.
export { windowFor, valueInWindow, latestBefore, valueAt, CARRY_FORWARD_YEARS } from '../../scripts/lib/timeline.mjs';

// The stop in `stops` nearest to a year.
export const nearestStop = (stops, y) => stops.reduce((best, s) => (Math.abs(s - y) < Math.abs(best - y) ? s : best), stops[0]);
