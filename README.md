# calendar

Book to meet with me! The booking page for [matt-jones.org](https://www.matt-jones.org),
with a Google Calendar + Google Meet integration.

- `index.html` — the static booking page (works on its own as a `mailto:` flow).
- `src/server.js` — optional backend that books directly on Google Calendar and
  returns a Google Meet link.
- `portfolio.html` / `matt-jones-portfolio.pdf` — a portfolio one-pager.

## Google Calendar booking — setup

1. **Create OAuth credentials.** In the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type *Web application*, and enable the
   [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   for the project. Add `http://localhost:3000/oauth2callback` to the client's
   **Authorized redirect URIs**.

2. **Configure.** Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   # edit .env — paste the client secret here, NOT into any committed file
   ```

   `.env` and `token.json` are gitignored; your secret and refresh token never
   get committed.

3. **Install & run.**

   ```bash
   npm install
   npm start
   ```

4. **Authorize once.** Open <http://localhost:3000/auth/google> and grant access.
   The refresh token is saved to `token.json`, so bookings work from then on
   without re-prompting.

## How a booking works

`POST /api/book` with JSON:

```json
{ "name": "Jane", "email": "jane@example.com", "date": "2026-11-03", "window": "Morning", "notes": "..." }
```

The server creates an event on the calendar named by `BOOKING_CALENDAR_ID`
(default `primary`), interpreting the time in `BOOKING_TIMEZONE`
(default `America/Chicago`), attaches a Google Meet link, and emails the
attendee an invite. It responds with `{ eventLink, meetLink, start }`.

`GET /api/health` reports `{ ok, authorized }` so the front end can tell whether
live booking is available or it should fall back to the `mailto:` flow.

## Security notes

- Secrets live only in `.env` (gitignored) and are read via `process.env` — they
  are never sent to the browser or committed.
- A Google **API key** cannot write to a private calendar; this uses **OAuth**,
  which is the supported path for creating events and Meet links.
- If a credential is ever exposed, rotate it in the Google Cloud Console —
  removing it from code or history is not enough.
