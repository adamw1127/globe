const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatValue(v, format) {
  if (v === null || v === undefined) return '–';
  if (typeof v !== 'number') return String(v);
  switch (format) {
    case 'usd':
      return `$${Math.round(v).toLocaleString('en-US')}`;
    case 'usd_compact':
      return `${v < 0 ? '-' : ''}$${compact.format(Math.abs(v))}`;
    case 'percent':
      return `${v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}%`;
    case 'compact':
      return compact.format(v);
    case 'integer':
      return Math.round(v).toLocaleString('en-US');
    case 'decimal2':
      return v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    case 'decimal1':
    default:
      return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
}

// Short axis/legend labels.
export function formatShort(v, format) {
  if (typeof v !== 'number') return String(v);
  if (format === 'usd' || format === 'usd_compact') return `${v < 0 ? '-' : ''}$${compact.format(Math.abs(v))}`;
  if (format === 'percent') return `${compact.format(v)}%`;
  return compact.format(v);
}

// Legend labels: three significant digits so neighboring bins differ.
const legend = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
export function formatLegend(v, format) {
  if (format === 'usd' || format === 'usd_compact') return `${v < 0 ? '-' : ''}$${legend.format(Math.abs(v))}`;
  if (format === 'percent') return `${legend.format(v)}%`;
  return legend.format(v);
}
