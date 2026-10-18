/** Build a CSV file and hand it to the browser as a download. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  downloadBlob(filename, new Blob([text], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Minor units → plain decimal string for spreadsheets. */
export function csvAmount(minor: number, exp: number) {
  return exp ? (minor / 10 ** exp).toFixed(exp) : String(minor);
}
