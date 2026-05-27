// Server-only auth config. These constants must never be imported by a Client
// Component, or the credentials would end up in the browser bundle.

/** Cookie that marks an authenticated session. */
export const SESSION_COOKIE = "loungee_session";

/** Username required to sign in (override with AUTH_USERNAME in production). */
export const AUTH_USER = process.env.AUTH_USERNAME ?? "admin";

/** Password required to sign in (override with AUTH_PASSWORD in production). */
export const AUTH_PASS = process.env.AUTH_PASSWORD ?? "adminkielaaafjasd";

/**
 * Bearer token stored in the session cookie. Only the server knows the valid
 * value, so a cookie can't be forged without it. Override with AUTH_SECRET in
 * production (the default is fine for a casual, low-stakes gate).
 */
export const SESSION_TOKEN = process.env.AUTH_SECRET ?? "loungee-c45bff-7a2b9e-session-v1";

/** True when the request's session cookie carries the valid token. */
export function isValidSession(token: string | undefined): boolean {
  return token === SESSION_TOKEN;
}
