// ==============================================================================
// WRR frontend - API helper (architecture.md §9.3)
// Every page talks to the backend through api(). The login cookie is HttpOnly, so
// JavaScript never sees the token; the browser sends it automatically.
// ==============================================================================

/**
 * Calls /api/v1<path> and returns { ok, status, body }.
 * body is the server's JSON envelope ({ success, message, data, errors }).
 * When the session is missing or expired (401) on a protected call, the user is
 * sent to the login page and brought back here afterwards.
 */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api/v1' + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (networkError) {
    return {
      ok: false,
      status: 0,
      body: { success: false, message: 'Cannot reach the server. Check your connection and try again.' }
    };
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${next}`;
  }

  const json = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    body: json || { success: false, message: `Unexpected server response (${res.status}).` }
  };
}

// Builds "?a=1&b=2" from an object, skipping empty values
export function query(params) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
