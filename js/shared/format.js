// Formattatori condivisi.
function fmtEur(n) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}
