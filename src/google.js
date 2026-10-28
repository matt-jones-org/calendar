/**
 * Google Calendar integration for the booking page.
 *
 * Wraps the OAuth 2.0 handshake and a single "create a booking" call. All
 * credentials are read from the environment (see `.env.example`) and the
 * authorizing account's refresh token is cached in a git-ignored `token.json`
 * so the server can keep creating events without re-prompting.
 *
 * Nothing secret is ever hardcoded or sent to the browser.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = join(__dirname, "..", "token.json");

// Scope: create/manage events on the authorizing account's calendar.
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/** Booking time windows (local wall-clock hours), matching the site copy. */
const WINDOWS = {
  Morning: { start: 9, end: 12 },
  Afternoon: { start: 12, end: 17 },
  Evening: { start: 17, end: 20 },
};

/** Read a required environment variable, failing loudly if it's missing. */
function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in (see that file for where to obtain the value).`,
    );
  }
  return value;
}

/** Build an OAuth2 client from the configured credentials. */
export function makeOAuthClient() {
  const client = new google.auth.OAuth2(
    requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    requireEnv("GOOGLE_OAUTH_REDIRECT_URI"),
  );
  // Reuse a previously saved refresh token if we have one.
  if (existsSync(TOKEN_PATH)) {
    try {
      client.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf8")));
    } catch {
      /* ignore a corrupt token file — the owner can re-authorize */
    }
  }
  return client;
}

/** Whether the server has an authorizing account's token cached. */
export function hasStoredToken() {
  return existsSync(TOKEN_PATH);
}

/** URL the site owner visits once to grant calendar access. */
export function getAuthUrl(client) {
  return client.generateAuthUrl({
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force a refresh token on re-auth
    scope: SCOPES,
  });
}

/** Exchange an OAuth callback code for tokens and persist them locally. */
export async function saveTokenFromCode(client, code) {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  // Persist refresh_token (and access_token) for later bookings.
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

/**
 * Create a booking on the configured calendar with a Google Meet link.
 *
 * @param {object} details
 * @param {string} details.name   Who is booking.
 * @param {string} details.email  Their email (added as an attendee).
 * @param {string} details.date   Day as `YYYY-MM-DD`.
 * @param {string} details.window One of "Morning" | "Afternoon" | "Evening".
 * @param {string} [details.notes] What they'd like to talk about.
 * @returns {Promise<{eventLink: string, meetLink: string|null, start: string}>}
 */
export async function createBooking({ name, email, date, window, notes }) {
  const win = WINDOWS[window];
  if (!win) {
    throw new Error(`Unknown window "${window}". Expected Morning, Afternoon, or Evening.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }

  const timeZone = process.env.BOOKING_TIMEZONE?.trim() || "America/Chicago";
  const calendarId = process.env.BOOKING_CALENDAR_ID?.trim() || "primary";

  const auth = makeOAuthClient();
  if (!hasStoredToken()) {
    throw new Error("No Google authorization yet — the site owner must visit /auth/google once.");
  }
  const calendar = google.calendar({ version: "v3", auth });

  const pad = (n) => String(n).padStart(2, "0");
  // Wall-clock times; `timeZone` tells Google how to interpret them.
  const start = `${date}T${pad(win.start)}:00:00`;
  const end = `${date}T${pad(win.end)}:00:00`;

  const res = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1, // required for Meet link creation
    sendUpdates: "all", // email the attendee an invite
    requestBody: {
      summary: `Meet with Matt — ${name || "Guest"}`,
      description:
        `Booked via matt-jones.org\n\nFrom: ${name || "Guest"} <${email || "no email"}>` +
        (notes ? `\n\nNotes:\n${notes}` : ""),
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone },
      attendees: email ? [{ email }] : [],
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  return {
    eventLink: res.data.htmlLink,
    meetLink: res.data.hangoutLink || null,
    start,
  };
}
