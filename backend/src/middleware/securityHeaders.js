// ==============================================================================
// Waste Resource Recycle (WRR) - Security Headers (NFR-03)
// A few browser protections, set by hand so no extra package is needed.
// ==============================================================================

// Content-Security-Policy: the browser only runs scripts, styles and images that come
// from this same server. Even if an attacker managed to put <script> text into a page,
// the browser would refuse to run it. Because of this, frontend pages must use
// separate .js and .css files (no inline <script> blocks, onclick="..." or style="...").
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff'); // never guess a file's type
  res.setHeader('X-Frame-Options', 'DENY');           // no embedding in other sites (clickjacking)
  res.setHeader('Referrer-Policy', 'same-origin');    // don't leak our URLs to other sites
  // HTTPS only (deployment, NFR-03.2): the browser must use HTTPS for this site for one year.
  // req.secure is true behind Railway's HTTPS proxy (TRUST_PROXY=1), false on localhost.
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}

module.exports = {
  CSP,
  securityHeaders
};
