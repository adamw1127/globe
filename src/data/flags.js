import { fetchJSON } from './fetchJSON.js';

// Flag image URL for an ISO2 code: from the packed bundle (data/flags.json,
// written by scripts/build-artifact.mjs) when present, else public/flags.
export async function flagUrl(iso2) {
  if (!iso2) return null;
  const code = iso2.toLowerCase();
  const pack = await fetchJSON('data/flags.json');
  if (pack) return pack[code] ?? null;
  return `${import.meta.env.BASE_URL}flags/${code}.png`;
}
