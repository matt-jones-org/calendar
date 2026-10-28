/**
 * Booking server for matt-jones.org.
 *
 * Serves the static site and exposes a tiny API that books a slot on Google
 * Calendar and returns a Google Meet link. Run with `npm start` after creating
 * a `.env` (see `.env.example`).
 *
 * Routes:
 *   GET  /auth/google     → one-time owner authorization (redirects to Google)
 *   GET  /oauth2callback  → OAuth redirect target; stores the refresh token
 *   GET  /api/health      → reports whether the server is authorized to book
 *   POST /api/book        → { name, email, date, window, notes } → creates event
 *   (everything else)     → static files from the repo root
 */
import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  makeOAuthClient,
  getAuthUrl,
  saveTokenFromCode,
  hasStoredToken,
  createBooking,
} from "./google.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

// --- One-time owner authorization ------------------------------------------

app.get("/auth/google", (_req, res) => {
  try {
    res.redirect(getAuthUrl(makeOAuthClient()));
  } catch (err) {
    res.status(500).send(String(err.message || err));
  }
});

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing ?code from Google.");
  try {
    await saveTokenFromCode(makeOAuthClient(), String(code));
    res.send("✅ Authorized. The booking page can now create Google Calendar events. You can close this tab.");
  } catch (err) {
    res.status(500).send(`Authorization failed: ${err.message || err}`);
  }
});

// --- Booking API ------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, authorized: hasStoredToken() });
});

app.post("/api/book", async (req, res) => {
  const { name, email, date, window, notes } = req.body ?? {};
  if (!date || !window) {
    return res.status(400).json({ error: "date and window are required." });
  }
  try {
    const booking = await createBooking({ name, email, date, window, notes });
    res.json({ ok: true, ...booking });
  } catch (err) {
    // 409 when the server just isn't authorized yet; 500 for genuine failures.
    const unauthorized = /authorization/i.test(String(err.message));
    res.status(unauthorized ? 409 : 500).json({ error: String(err.message || err) });
  }
});

// --- Static site ------------------------------------------------------------

app.use(express.static(ROOT, { extensions: ["html"] }));

app.listen(PORT, () => {
  console.log(`matt-jones.org booking server on http://localhost:${PORT}`);
  if (!hasStoredToken()) {
    console.log(`→ Not yet authorized. Visit http://localhost:${PORT}/auth/google once to connect Google Calendar.`);
  }
});
