# rossrosenbaum.github.io

Run a local Node.js server to enable persistent checklist state across sessions:

- Install dependencies:

	npm install

- Start the server (serves the site and provides the API):

	npm start

The server listens on port 3000 by default. It provides an API for checklist state storage:

- GET /api/state?page={page}&userId={userId?} — returns saved state; if `userId` is provided the server returns per-user state, otherwise it returns the global page-level state (shared across devices)
- POST /api/state — JSON body { page, states, userId? } to save state; omit `userId` to write global page state

Checklist states are stored to `data/states.json` in the project folder. Global page state is stored under the `global` key in that file.