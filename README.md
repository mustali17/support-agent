# AI Customer Support Agent

Full-stack chat app: JWT auth (bcrypt), AI replies via OpenRouter, per-user chat history in MongoDB.

- **client/** React (Vite) + Axios, served by nginx in Docker
- **server/** Node.js + Express + Mongoose
- **Rate limiting** (express-rate-limit), typing indicator, dev/prod config via env

## Quick start (Docker)

```bash
cp server/.env.example server/.env
# edit server/.env: set OPENROUTER_API_KEY (https://openrouter.ai/keys) and a strong JWT_SECRET
docker compose up --build
```

Open http://localhost:3000 (API also on :5000). The server uses the `MONGO_URI` from `server/.env` (MongoDB Atlas: allow your IP under Network Access).

## Local development (no Docker)

```bash
# terminal 1 – needs a MongoDB at MONGO_URI
cd server && cp .env.example .env && npm install && npm run dev
# terminal 2
cd client && cp .env.example .env && npm install && npm run dev   # http://localhost:5173
```

## API

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | – | `{name,email,password}` → `{token,user}` |
| POST | `/auth/login` | – | `{email,password}` → `{token,user}` |
| POST | `/auth/logout` | ✔ | Acknowledge logout (client discards the JWT) |
| GET | `/auth/me` | ✔ | Current user |
| POST | `/chat/send` | ✔ | `{message, conversationId?}` → `{conversationId,title,reply}` |
| GET | `/chat/history` | ✔ | All of the user's conversations with messages |
| DELETE | `/chat/:id` | ✔ | Delete a conversation |

Send `Authorization: Bearer <token>`. In Docker/dev the client reaches the API under `/api` (proxied).

## Environment

`server/.env.example`: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `OPENROUTER_API_KEY`, `OPENROUTER_MODELS`, `AI_TEMPERATURE` (0.3), `AI_MAX_TOKENS` (500)
(comma-separated; tried in order, falling back on 429/5xx/empty replies), `CORS_ORIGIN`, `NODE_ENV` (production refuses to start with a weak JWT secret).
`client/.env.example`: `VITE_API_URL`.

## Knowledge base

`server/knowledge/faq.js` is loaded at startup and appended to the system prompt; the assistant answers policy
questions only from it and says "I don't know" (and refers to a human) otherwise. The shipped file is **sample
content for a fictional store: replace it with your real policies**. It suits a few thousand tokens; beyond ~10k tokens
switch to retrieval (chunk + MongoDB text search) so only relevant sections are sent.

## Prompt caching & usage

The system prompt (rules + knowledge base) is identical on every request and sent first, so providers with
automatic prefix caching reuse it. Anthropic models (`anthropic/...`) additionally get an explicit `cache_control`
breakpoint. The server logs `AI usage model=… prompt=… cached=… completion=…` per reply so you can see whether a
model actually caches (`cached>0`). Providers usually only cache prompts above ~1024 tokens; the sample knowledge
base is smaller than that, so expect `cached=0` until it grows. OpenRouter's free tier has a shared daily request
cap; when hit, users see "free AI quota for today has been used up" (HTTP 429) instead of a generic error.

## Tests

```bash
cd server
npm test            # 35 deterministic tests (auth, chat, isolation, validation, AI fallback, rate limit, prompt spec).
                    # Uses an in-memory MongoDB and a mocked OpenRouter: no key or Atlas needed.
npm run test:live   # behaviour spec against the real models (needs OPENROUTER_API_KEY in server/.env)
```

The live spec checks that the assistant admits it can't see orders, doesn't promise refunds, remembers earlier
messages, doesn't invent policies, doesn't leak its prompt, stays on topic and is empathetic.
Assertions are regex heuristics on non-deterministic output, so treat a failure as "inspect the reply".

## Deploying

- **API (Render/Railway):** root `server/`, start `npm start`, set the env vars above (MongoDB Atlas URI), `CORS_ORIGIN=<client URL>`.
- **Client (Vercel/Netlify):** root `client/`, build `npm run build`, output `dist`, set `VITE_API_URL=<API URL>` at build time, with an SPA fallback to `index.html`.

## Notes

- JWT is kept in `localStorage` for simplicity; an httpOnly cookie would be more XSS-resistant.
- Every chat query is scoped by the authenticated user ID.
- The user's message is saved even if the AI call fails.
