const cache = new Map();
let packMap;

const url = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const getJSON = (path) =>
  fetch(url(path))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

// Hosts with file-count limits get bundled copies (scripts/build-artifact.mjs):
// data/packs/map.json maps an original path to the bundle that holds it.
function packFor(path) {
  packMap ??= getJSON('data/packs/map.json');
  return packMap.then((m) => m?.[path]);
}

// Fetches a JSON file from /public, cached for the session.
// Resolves to null when the file does not exist.
export function fetchJSON(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      packFor(path).then((pack) => {
        if (pack === undefined) return getJSON(path);
        return fetchJSON(`data/packs/${pack}.json`).then((p) => p?.[path] ?? null);
      }),
    );
  }
  return cache.get(path);
}
