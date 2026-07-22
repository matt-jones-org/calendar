/**
 * Minimal HTTP server for the calendar app. Dependency-free (Node's built-in
 * http). Endpoints:
 *
 *   GET  /                        -> tiny landing page with a "Connect" link
 *   GET  /health                  -> { status: "ok" }
 *   GET  /auth/google/login       -> 302 redirect to Google's consent screen
 *   GET  /auth/google/callback    -> exchanges the code, returns sign-in summary
 *
 * Listens on $PORT (default 8080, the Google Cloud convention).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { isOAuthConfigured } from "./config.js";
import {
  buildAuthUrl,
  decodeIdToken,
  exchangeCodeForTokens,
} from "./oauth/google.js";

const PORT = Number(process.env.PORT ?? 8080);

/** Name of the cookie that carries the anti-CSRF OAuth `state` value. */
const STATE_COOKIE = "g_oauth_state";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

/** Parse a Cookie header into a plain name->value map. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (name) out[name] = decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return out;
}

/** Build a Set-Cookie value with sane security defaults. maxAge is in seconds. */
function cookie(name: string, value: string, maxAge: number): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  return attrs.join("; ");
}

const LANDING_PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Book to meet with me!</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;">
    <h1>Book to meet with me!</h1>
    <p>Connect your Google Calendar to get started.</p>
    <p><a href="/auth/google/login">Connect Google Calendar &rarr;</a></p>
  </body>
</html>`;

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      return html(res, 200, LANDING_PAGE);
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { status: "ok", oauthConfigured: isOAuthConfigured() });
    }

    // --- Google OAuth: step 1, send the user to the consent screen. ---
    if (req.method === "GET" && url.pathname === "/auth/google/login") {
      let authUrl: string;
      const state = randomBytes(16).toString("hex");
      try {
        authUrl = buildAuthUrl({ state });
      } catch (err) {
        // Misconfiguration (missing client id/secret or redirect URI).
        return json(res, 503, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      res.writeHead(302, {
        location: authUrl,
        // Bind the state to this browser so we can verify it on callback.
        "set-cookie": cookie(STATE_COOKIE, state, 600),
      });
      return res.end();
    }

    // --- Google OAuth: step 2, Google redirects back here with a code. ---
    if (req.method === "GET" && url.pathname === "/auth/google/callback") {
      const error = url.searchParams.get("error");
      if (error) {
        return json(res, 400, { error: `Authorization was denied: ${error}` });
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expectedState = parseCookies(req.headers.cookie)[STATE_COOKIE];

      if (!code || !state) {
        return json(res, 400, { error: "Missing 'code' or 'state' parameter." });
      }
      // Reject on any state mismatch (CSRF guard).
      if (!expectedState || state !== expectedState) {
        return json(res, 400, {
          error: "Invalid OAuth state — possible CSRF, or the login expired.",
        });
      }

      let tokens;
      try {
        tokens = await exchangeCodeForTokens(code);
      } catch (err) {
        return json(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const claims = tokens.idToken ? decodeIdToken(tokens.idToken) : undefined;

      // Clear the one-time state cookie now that the flow is complete.
      res.setHeader("set-cookie", cookie(STATE_COOKIE, "", 0));
      // Return a summary only — never echo the access/refresh tokens to the
      // browser. In a real app you'd persist them server-side against a session
      // and use the access token to call the Google Calendar API.
      return json(res, 200, {
        signedIn: true,
        user: claims ? { email: claims.email, name: claims.name } : undefined,
        grantedScopes: tokens.scope,
        accessTokenExpiresIn: tokens.expiresIn,
        refreshTokenGranted: Boolean(tokens.refreshToken),
      });
    }

    return json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  } catch (err) {
    return json(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, () => {
  console.log(`calendar server listening on :${PORT}`);
});
