const cache = new Map();

// Fetches a JSON file from /public, cached for the session.
// Resolves to null when the file does not exist.
export function fetchJSON(path) {
  if (!cache.has(path)) {
    const url = `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
    cache.set(
      path,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(path);
}
