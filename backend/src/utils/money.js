// ==============================================================================
// Waste Resource Recycle (WRR) - Exact comparison of DECIMAL(10,2) values
// The database returns DECIMALs as strings ('55.00'). Comparing them as JS floats can
// be off by a tiny fraction, so we compare whole hundredths (integer "cents") instead.
// ==============================================================================

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function centsToString(cents) {
  return (cents / 100).toFixed(2);
}

module.exports = {
  toCents,
  centsToString
};
