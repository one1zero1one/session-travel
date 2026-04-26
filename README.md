# session-travel

A bridge between Claude Code and Claude.ai voice. One context payload in transit at a time, two slots, in-memory.

```
┌──────────────┐                                        ┌──────────────┐
│ Claude Code  │  /ship  →  [context]   →  pick up  →   │ Claude.ai    │
│  (desktop)   │                                        │  (voice)     │
│              │  ←  pick up  ←  [conclusion]  ←  ship  │              │
└──────────────┘                                        └──────────────┘
                  session-travel.<your-domain>
```

You're working in Claude Code, you want to switch to voice without losing context. `/ship` packages the current conversation (verbatim text + Haiku-summarized tool calls), pushes it to a remote MCP server. From your phone you say "pick up the session", voice loads the context. When done, "ship the conclusion" — voice synthesizes a structured decision record. Back in Claude Code, you pick it up and continue.

## What's in here

- **MCP server** (TypeScript + Express) exposing four tools: `ship_context`, `pickup_context`, `ship_conclusion`, `pickup_conclusion`
- **OAuth 2.1 with PKCE** server (auto-approve, single-user) — required because Claude.ai's custom connectors don't accept bearer tokens
- **Bearer auth** for the Claude Code side (simpler, headers in `.mcp.json`)
- **Two-slot in-memory store** (1MB cap each, ephemeral)
- **OAuth tokens persisted** to a Docker volume (survive restarts)
- **`/ship` Claude Code skill** that reads session JSONL and ships
- **Streamable HTTP transport** (MCP spec)

## Install

```bash
npm install
npm test          # 26 tests
npm run build
```

Required env vars:
```
BEARER_TOKEN=<long random token, for Claude Code .mcp.json>
DOMAIN=<your.domain>
PORT=3000
DATA_DIR=/data    # for OAuth token persistence
```

## Deploy

Docker container behind a reverse proxy with TLS. Example for Traefik (see `Dockerfile` and the docker-compose snippet in the design doc).

## Connect

**Claude Code side:**
```bash
claude mcp add --scope user --transport http session-travel \
  https://<your.domain>/mcp \
  --header "Authorization: Bearer <BEARER_TOKEN>"
```

**Claude.ai side:** Settings → Connectors → Add custom connector → enter `https://<your.domain>` (or `/mcp`). Browser does the OAuth dance once. Done forever via refresh token.

## Use

1. In Claude Code: `/ship`
2. On phone: "pick up the session from session-travel"
3. Voice conversation
4. "Ship the conclusion"
5. Back in Claude Code: "pick up the conclusion"

## Diagrams

- **Architecture**: [`docs/superpowers/architecture.excalidraw`](docs/superpowers/architecture.excalidraw) — open in [excalidraw.com](https://excalidraw.com)
- **Sequence flow**: [`docs/superpowers/flow.html`](docs/superpowers/flow.html) — open in any browser

## Design

Spec: [`docs/superpowers/specs/2026-04-25-session-travel-design.md`](docs/superpowers/specs/2026-04-25-session-travel-design.md)
Implementation plan: [`docs/superpowers/plans/2026-04-25-session-travel.md`](docs/superpowers/plans/2026-04-25-session-travel.md)

## Why two-slot, not session IDs

Single-user, single-conversation-in-flight. Session IDs add cognitive load (remember which one) without buying anything. Second ship overwrites. Container restart wipes the slots — re-ship is the recovery path.

## License

MIT
