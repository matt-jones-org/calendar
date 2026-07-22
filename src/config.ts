/**
 * Central configuration for the calendar app.
 *
 * Loads the Google OAuth client credentials from the environment (via a local
 * `.env` file in development, or real environment variables in production).
 * Credentials are never hardcoded — see `.env.example`.
 */
import "dotenv/config";

/** Google OAuth client credentials, for a user-delegated authorization flow. */
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Return the Google OAuth client credentials, or `undefined` if either the
 * client ID or client secret is missing (blank/whitespace counts as missing).
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | undefined {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret };
}

/** Whether Google OAuth is fully configured. */
export function isOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== undefined;
}
