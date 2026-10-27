# Public website deployment

This app is a static Vite site. Cloudflare Pages can serve the built site publicly; Supabase continues to provide rooms, answers, and Realtime updates. Participants can use their own internet connections and do not need to share the host's local network.

## 1. Prepare Supabase Free

1. Create a Supabase project in a region close to the expected audience.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. In the project API settings, copy the project URL and the **anon/publishable key**. Never use a `service_role` or secret key in this browser app.
4. Keep the project on Free for development and small tests. The current Free quota is 200 peak Realtime connections. Every host or participant browser is a connection, so 200 participants plus the host can exceed that quota. Do not treat the Free plan as confirmed capacity for a 200-person event. Recheck current quotas before the event; Supabase plan limits can change.

## 2. Choose a Cloudflare Pages deployment path

### Recommended for ongoing development: Git integration

Cloudflare Pages deploys each time the connected GitHub or GitLab production branch changes. This workspace currently has no Git remote, so first put the project in a repository that Cloudflare can access.

In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git**. Select the repository and configure:

- Framework preset: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

Before the first production build, add these build environment variables in the Pages project settings for the Production environment:

- `VITE_SUPABASE_URL` — the Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — the Supabase anon/publishable key

Then save and deploy. Cloudflare provides a public `pages.dev` address with HTTPS. The app creates its QR join link from the address the host is using, so the QR code will point to this public site.

### Manual first deployment: Direct Upload

Use this if you want a public preview before setting up Git. Direct Upload can take a prebuilt `dist` folder or ZIP through the Cloudflare dashboard. Build with the two `VITE_SUPABASE_*` values available in the local build environment, then upload `dist` from **Workers & Pages → Create application → Pages → Drag and drop your files**.

Cloudflare Direct Upload projects cannot later be converted to Git integration. If you choose this path and later want automatic deployments, create a new Git-integrated Pages project.

## 3. Verify from outside the host network

1. Open the public `pages.dev` address on the host computer and create a quiz room.
2. Scan the QR code with a phone using cellular data (turn Wi-Fi off), or type the PIN at the public site.
3. Confirm the phone joins, receives the first question after the host starts, submits an answer, and receives the reveal.
4. Check **Supabase → Realtime Reports** and project usage after the test.

Cloudflare's static hosting is separate from the live-game capacity. For a 200-person event, ramp a real or simulated load test against the deployed app and Supabase project before relying on it. Supabase Free's current 200-connection quota leaves no room for the host and reconnects at that attendance; upgrade Supabase before the event if the tested usage requires more headroom.

## Project build settings

The local commands are `npm run build` and `npm test`. Environment variable names are listed in [`.env.example`](.env.example); local values belong in the ignored `.env.local` file and should not be committed.
