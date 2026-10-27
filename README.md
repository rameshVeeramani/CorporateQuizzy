# Quizzy

Quizzy is a browser-based live quiz app. Quiz definitions remain in the host's browser; live rooms, answers, scoring, and completed rankings use Supabase.

## Configure live rooms

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the project's SQL editor. It creates the tables, indexes, access-controlled RPCs, and small realtime invalidation broadcasts.
3. Copy `.env.example` to `.env.local` and replace both placeholders with the project URL and anon/publishable key from the Supabase API settings.
4. Run `npm install` and `npm run start`.

The browser uses the Supabase anon key only. A random host identity and secret are kept in that browser's local storage so completed results can be listed later; participant secrets are scoped to a game and kept in session storage. The database stores only SHA-256 hashes. Direct table access is disabled by row-level security. Game operations and reads go through credential-checking RPCs. Participants do not receive answer keys until the current question reveal.

Rooms default to a 500 player limit. The database serializes joins against the room row, so simultaneous joins cannot exceed capacity; a case-insensitive unique index prevents duplicate display names. Answers are unique per player and question. The server sets question deadlines and is authoritative for accepting answers and scoring them. A completed leaderboard is saved in `game_results`.

Realtime broadcasts are sent only for game-phase changes and contain no participant answers or quiz data. Each client then fetches the view allowed by its room credential. The host polls lobby totals and answer counts once per second; during play it receives only a small roster slice. Participants receive only the top ten plus their own position, along with the current question and their own submitted answer. This avoids broadcasting every one of hundreds of simultaneous answer submissions to every participant.

## Local checks

- `npm run build` builds the frontend.
- `npm test` runs unit tests and the room workflow integration simulation.
- `npm run test:coverage` enforces 100% statement, branch, function, and line coverage for the isolated backend adapter and game-logic modules. This is not a claim of 100% coverage for the full browser UI.
- A real Supabase RPC integration test is included in `tests/integration/supabaseLive.test.js`. It runs only when `QUIZZY_ALLOW_LIVE_SUPABASE_TESTS=1`, `SUPABASE_TEST_URL`, and `SUPABASE_TEST_ANON_KEY` are set; it creates a completed test game in that project.
- Live cross-device play requires the Supabase schema and environment variables above. Without them, the app shows “Live games need setup” in the top bar and gives the setup steps when a live-room action is attempted. Restart the Vite server after creating or changing `.env.local`.
