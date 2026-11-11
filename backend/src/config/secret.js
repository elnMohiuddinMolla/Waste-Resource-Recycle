// ==============================================================================
// Waste Resource Recycle (WRR) - JWT secret check
// Anyone who knows the secret can sign their own token (e.g. with role "admin"),
// so the server refuses to start with a short or example secret.
// ==============================================================================

const MIN_LENGTH = 32;
const EXAMPLE_PREFIX = 'change_me'; // the placeholder in .env.example

// Returns null when the secret is fine, otherwise the reason it is not
function secretProblem(secret) {
  if (!secret) return 'JWT_SECRET is missing.';
  if (secret.startsWith(EXAMPLE_PREFIX)) return 'JWT_SECRET is still the example value from .env.example.';
  if (secret.length < MIN_LENGTH) return `JWT_SECRET must be at least ${MIN_LENGTH} characters long.`;
  return null;
}

module.exports = {
  MIN_LENGTH,
  secretProblem
};
