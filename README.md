# rossrosenbaum.github.io

Run a local Node.js server to enable persistent checklist state across sessions:

- Install dependencies:

	npm install

- Start the server (serves the site and provides the API):

	npm start

The server listens on port 3000 by default. It provides an API for checklist state storage:

- GET /api/state?page={page}&userId={userId?} — returns saved state; if `userId` is provided the server returns per-user state, otherwise it returns the global page-level state (shared across devices)
- POST /api/state — JSON body { page, states, userId? } to save state; omit `userId` to write global page state

Checklist state and leaderboard persistence now use Supabase. The backend persists state to the `states` table and leaderboard entries to the `leaderboard` table.

Supabase backend setup:

- Create a Supabase project and add the following tables using the SQL editor:

```sql
create table leaderboard (
  name text primary key,
  hotdogs int not null,
  timestamp timestamptz not null default now()
);

create table states (
  scope text not null,
  page text not null,
  states jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (scope, page)
);
```

- Set your backend host environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

- Create a local `.env` from `.env.example` and keep `.env` private.
- Deploy this Node app to a Node-capable host and keep the Supabase key private.
- If your frontend remains on GitHub Pages, set `window.API_BASE_URL` to your backend URL in the static pages or replace the default `http://localhost:3000` value.

Example: add a small script above your app JavaScript to define `window.API_BASE_URL`:

```html
<script>window.API_BASE_URL = 'https://your-backend.example.com';</script>
```

Note: static-only deployments such as GitHub Pages do not support the `/api/*` backend endpoints or Supabase-backed persistence. The backend must be hosted separately on a Node-capable host.