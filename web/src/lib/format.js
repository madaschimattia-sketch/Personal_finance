// Formato numerico richiesto: virgola migliaia / punto decimali (en-US), anche se
// il resto dell'app (copy, label) resta in italiano.
export function fmtEur(n) {
  return (n ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(n, decimals = 1) {
  return `${(n ?? 0).toFixed(decimals)}%`;
}
