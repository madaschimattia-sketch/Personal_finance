export function fmtEur(n) {
  return (n ?? 0).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(n, decimals = 1) {
  return `${(n ?? 0).toFixed(decimals)}%`;
}
