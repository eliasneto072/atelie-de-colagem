/** File sizes as people read them, in Brazilian Portuguese. */

/** Whether the bytes contain this ASCII text, without turning a large file into a string. */
export function includesAscii(bytes: Uint8Array, text: string): boolean {
  const t = [...text].map((c) => c.charCodeAt(0));
  const first = t[0];
  for (
    let i = bytes.indexOf(first);
    i >= 0 && i + t.length <= bytes.length;
    i = bytes.indexOf(first, i + 1)
  ) {
    let k = 1;
    while (k < t.length && bytes[i + k] === t[k]) k++;
    if (k === t.length) return true;
  }
  return false;
}

const pt = (n: number, digits: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits });

/**
 * "780 KB", "1,6 MB". Decimal units (1 MB = 1.000.000 bytes), as phones and websites count.
 * A file just over a whole number of megabytes gets two decimals ("2,01 MB"), so it never
 * reads as the limit it doesn't fit in.
 */
export function formatSize(bytes: number): string {
  if (bytes < 999_500) return `${Math.max(1, Math.ceil(bytes / 1000))} KB`;
  const one = Math.round(bytes / 100_000) / 10;
  if (Number.isInteger(one) && bytes > one * 1_000_000) return `${pt(Math.ceil(bytes / 10_000) / 100, 2)} MB`;
  return `${pt(one, 1)} MB`;
}
