import { fetchJSON } from './fetchJSON.js';

// Trade detail for one territory-year, or null. Reads the per-territory,
// per-year files, or the packed bundles (data/trade-packs) when the site
// was built with scripts/build-artifact.mjs.
export async function loadTrade(tradeIndex, codes, year) {
  const packMap = await fetchJSON('data/trade-packs/map.json');
  for (const code of codes) {
    const entry = tradeIndex[code];
    if (!entry || !(entry.products.includes(year) || entry.partners.includes(year))) continue;
    let data;
    if (packMap?.[code] !== undefined) {
      const pack = await fetchJSON(`data/trade-packs/${packMap[code]}.json`);
      data = pack?.[code]?.[year];
    } else {
      data = await fetchJSON(`data/trade/${code}/${year}.json`);
    }
    if (data) return { ...data, code };
  }
  return null;
}
