/**
 * Google OAuth 2.0 — server-side authorization-code flow.
 *
 * The user-delegated path: a user is redirected to Google, grants consent, and
 * Google redirects back with a one-time `code` that we exchange
 * (server-to-server, using the client secret) for access / refresh tokens.
 *
 * Credentials come from the environment via `getGoogleOAuthConfig()` — the
 * client secret is NEVER hardcoded or committed. See `.env.example`.
 *
 * Security notes:
 *   - The `state` parameter is generated per-request and verified on callback
 *     to defend against CSRF; the caller owns that round-trip (see `server.ts`,
 *     which stores it in an httpOnly cookie).
 *   - Scopes default to identity + read-only calendar access. Grant broader
 *     scopes (e.g. calendar.events) only deliberately, via GOOGLE_OAUTH_SCOPES.
 */
import { getGoogleOAuthConfig } from "../config.js";

/** Google's OAuth 2.0 authorization and token endpoints. */
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Default scopes: identify the user and read their calendars — enough for a
 * "when am I free" booking view. Deliberately read-only; add
 * `.../auth/calendar.events` via GOOGLE_OAUTH_SCOPES to create bookings.
 */
const DEFAULT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/**
 * The redirect URI Google sends the user back to after consent. Must exactly
 * match one of the "Authorized redirect URIs" registered on the OAuth client.
 * Read from GOOGLE_OAUTH_REDIRECT_URI.
 */
export function getRedirectUri(): string {
  const uri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!uri) {
    throw new Error(
      "Missing GOOGLE_OAUTH_REDIRECT_URI. Set it to the callback URL " +
        "registered on your OAuth client (e.g. http://localhost:8080/auth/google/callback).",
    );
  }
  return uri;
}

/**
 * OAuth scopes to request. Override the default identity + calendar.readonly
 * scopes with a space- or comma-separated GOOGLE_OAUTH_SCOPES value.
 */
export function getScopes(): string[] {
  const raw = process.env.GOOGLE_OAUTH_SCOPES?.trim();
  if (!raw) return DEFAULT_SCOPES;
  return raw.split(/[\s,]+/).filter(Boolean);
}

/** Options for building the authorization-request URL. */
export interface AuthUrlOptions {
  /** Opaque anti-CSRF token; must be echoed back and verified on callback. */
  state: string;
  /**
   * Request a refresh token (`access_type=offline`). Defaults to true so a
   * long-lived refresh token is issued on first consent.
   */
  offline?: boolean;
  /**
   * Force the consent screen (`prompt=consent`). Useful to guarantee a
   * refresh token is re-issued. Defaults to false.
   */
  forceConsent?: boolean;
}

/**
 * Build the Google authorization URL to redirect the user to. Nothing secret
 * is included — only the public client ID, redirect URI, scopes, and state.
 */
export function buildAuthUrl(options: AuthUrlOptions): string {
  const { clientId } = requireOAuthConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: getScopes().join(" "),
    state: options.state,
    access_type: options.offline === false ? "online" : "offline",
    include_granted_scopes: "true",
  });
  if (options.forceConsent) params.set("prompt", "consent");

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Tokens returned by Google's token endpoint (camelCased). */
export interface GoogleTokens {
  accessToken: string;
  /** Lifetime of the access token, in seconds. */
  expiresIn?: number;
  /** Present only when offline access was requested and granted. */
  refreshToken?: string;
  /** Space-separated scopes actually granted. */
  scope?: string;
  tokenType?: string;
  /** OpenID Connect ID token (a JWT), present when the `openid` scope is used. */
  idToken?: string;
}

/**
 * Exchange a one-time authorization `code` for tokens. This is a
 * server-to-server call that sends the client secret to Google's token
 * endpoint — it must never run in a browser.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireOAuthConfig();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail =
      typeof raw.error_description === "string"
        ? raw.error_description
        : typeof raw.error === "string"
          ? raw.error
          : `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${detail}`);
  }

  return {
    accessToken: String(raw.access_token ?? ""),
    expiresIn: typeof raw.expires_in === "number" ? raw.expires_in : undefined,
    refreshToken:
      typeof raw.refresh_token === "string" ? raw.refresh_token : undefined,
    scope: typeof raw.scope === "string" ? raw.scope : undefined,
    tokenType: typeof raw.token_type === "string" ? raw.token_type : undefined,
    idToken: typeof raw.id_token === "string" ? raw.id_token : undefined,
  };
}

/** Claims we care about from a decoded ID token. */
export interface IdTokenClaims {
  email?: string;
  emailVerified?: boolean;
  name?: string;
  sub?: string;
}

/**
 * Decode (WITHOUT verifying) the payload of an ID token JWT. This is enough to
 * display who signed in during development, but the signature is NOT checked —
 * before trusting these claims in production, verify the token against Google's
 * public keys (https://www.googleapis.com/oauth2/v3/certs).
 */
export function decodeIdToken(idToken: string): IdTokenClaims | undefined {
  const parts = idToken.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    return {
      email: typeof payload.email === "string" ? payload.email : undefined,
      emailVerified:
        typeof payload.email_verified === "boolean"
          ? payload.email_verified
          : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Fetch OAuth credentials from config, or throw a clear, actionable error. */
function requireOAuthConfig(): { clientId: string; clientSecret: string } {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and " +
        "GOOGLE_OAUTH_CLIENT_SECRET in your .env (see .env.example).",
    );
  }
  return config;
}
