/** Shared formatting helpers for the sim's text and CSV reports. */

export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] ?? '').length)));
  const line = (cells: readonly string[]): string => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export const pct = (x: number | null): string => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);

export const signedPct = (x: number | null): string => (x === null ? '-' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`);

export const fixed = (x: number | null, digits: number): string => (x === null ? '-' : x.toFixed(digits));

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** RFC 4180 CSV: fields with commas, quotes or newlines are quoted; nulls become empty cells. */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | boolean | null)[])[]): string {
  const cell = (value: string | number | boolean | null): string => {
    if (value === null) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}
