// Describes the data entity behind a territory and the codes to try when
// looking up its data.

export function describeEntity(code, { entities, countries }, fallbackName) {
  if (!code) {
    return { kind: 'none', code: null, name: fallbackName, successors: [] };
  }
  if (code.startsWith('PART:')) {
    const iso = code.slice(5);
    return { kind: 'part', code: null, name: fallbackName, successors: [iso] };
  }
  if (countries[code]) {
    return { kind: 'modern', code, name: countries[code].name, iso2: countries[code].iso2, successors: [] };
  }
  const h = entities.historical[code];
  if (h) {
    return {
      kind: 'historical',
      code,
      name: h.name,
      successors: h.successors ?? [],
      proxy: h.proxy ?? null,
      proxyNote: h.note ?? null,
      from: h.from,
      to: h.to,
    };
  }
  return { kind: 'none', code: null, name: fallbackName, successors: [] };
}

// Codes to search, in order: the entity itself, then its proxy successor.
export function dataCodes(entity) {
  if (!entity?.code) return [];
  return entity.proxy ? [entity.code, entity.proxy] : [entity.code];
}
