/**
 * Thin client for the Sprout API.
 *
 * The bearer token is kept in localStorage rather than relying on the session
 * cookie, because the reference deployment serves the web app and the API from
 * different origins and third-party cookies are increasingly blocked by
 * default. The API accepts either.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

const TOKEN_KEY = 'sprout.token';

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t) => window.localStorage.setItem(TOKEN_KEY, t),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-keyed messages, for rendering errors next to the input that caused them. */
  get fieldErrors() {
    return Object.fromEntries((this.details ?? []).map((d) => [d.field, d.message]));
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = tokenStore.get();

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // A network-level failure is almost always "the API is asleep" on a free
    // tier, so say that rather than surfacing "Failed to fetch".
    throw new ApiError(0, 'network_error', 'Could not reach the Sprout API. It may be waking up — try again in a moment.');
  }

  if (res.status === 204) return null;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const e = payload?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? `Request failed (${res.status})`, e.details);
  }

  return payload;
}

export const auth = {
  login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }),
  register: (name, email, password) => api('/auth/register', { method: 'POST', body: { name, email, password } }),
  demo: () => api('/auth/demo', { method: 'POST' }),
  me: () => api('/auth/me'),
  logout: () => api('/auth/logout', { method: 'POST' }),
};

export const children = {
  list: () => api('/children'),
  create: (body) => api('/children', { method: 'POST', body }),
  get: (id) => api(`/children/${id}`),
  remove: (id) => api(`/children/${id}`, { method: 'DELETE' }),
  overview: (id) => api(`/children/${id}/overview`),

  measurements: (id) => api(`/children/${id}/measurements`),
  addMeasurement: (id, body) => api(`/children/${id}/measurements`, { method: 'POST', body }),
  deleteMeasurement: (id, mid) => api(`/children/${id}/measurements/${mid}`, { method: 'DELETE' }),

  growth: (id, indicator) => api(`/children/${id}/growth/${indicator}`),

  milestones: (id) => api(`/children/${id}/milestones`),
  setMilestone: (id, key, body) => api(`/children/${id}/milestones/${key}`, { method: 'PUT', body }),

  immunisation: (id) => api(`/children/${id}/immunisation`),
  setDose: (id, key, body) => api(`/children/${id}/immunisation/${key}`, { method: 'PUT', body }),
  clearDose: (id, key) => api(`/children/${id}/immunisation/${key}`, { method: 'DELETE' }),
};
