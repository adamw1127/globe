import { fetchJSON } from './fetchJSON.js';

// Trade detail for one territory-year, or null.
export async function loadTrade(tradeIndex, codes, year) {
  for (const code of codes) {
    const entry = tradeIndex[code];
    if (entry && (entry.products.includes(year) || entry.partners.includes(year))) {
      const data = await fetchJSON(`data/trade/${code}/${year}.json`);
      if (data) return { ...data, code };
    }
  }
  return null;
}
