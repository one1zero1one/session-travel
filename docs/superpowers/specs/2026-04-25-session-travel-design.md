# session-travel: Design Spec

**Date:** 2026-04-25  
**Status:** Approved

## Problem

Working in Claude Code on desktop/server and wanting to continue a conversation via Claude.ai voice (mobile) requires manual copy-paste of context. There is no native bridge. This project builds one.

## What It Is

A bidirectional context bridge: a remote MCP server that holds one context payload in transit between a Claude Code session and a Claude.ai voice session. Two slots — one in each direction. One session in transit at a time.

```
Claude Code  →  /ship skill  →  [context slot]  →  Claude.ai voice
Claude Code  ←  pickup_conclusion  ←  [conclusion slot]  ←  Claude.ai voice
```

---

## Architecture

Three pieces, each with one job.

### 1. MCP Server

TypeScript + Express + MCP SDK (`@modelcontextprotocol/sdk` v1.20.0), running as a Docker container behind Traefik.

- Domain: `session-travel.thisisfine.be`
- Transport: StreamableHTTPServerTransport only (SSE transport deprecated in MCP spec; Claude.ai uses Streamable HTTP)
- Auth (Claude.ai side): OAuth 2.1 with PKCE — auto-approve, single user
- Auth (Claude Code side): Bearer token in `.mcp.json` header
- Persistence: OAuth tokens survive restarts via Docker volume (`session-travel-data` → `/data/tokens.json`). Context and conclusion slots are in-memory only.

### 2. `/ship` Skill (Claude Code)

A Claude Code skill (markdown file). When invoked:

1. Locates current session JSONL (`~/.claude/projects/<hash>/<session-id>.jsonl`)
2. Iterates message turns:
   - Human messages → verbatim
   - Assistant text → verbatim
   - Tool use/result pairs → one Haiku subagent call per pair → one summary line
3. Assembles ordered payload
4. Calls `ship_context` MCP tool
5. Confirms: "Shipped. Context slot updated."

### 3. Claude.ai Voice Connector

Connected once via OAuth dance (browser, auto-approved, ~10 seconds). Works forever via refresh token stored in Docker volume. Dani says "pick up the session" → voice calls `pickup_context`. At end of session, "ship the conclusion" → voice synthesizes structured markdown → calls `ship_conclusion`.

---

## Components

```
/media/storage1/projects/session-travel/
  src/
    server.ts    — Express app, MCP tools, wires everything
    store.ts     — Two-slot in-memory store (context + conclusion)
    oauth.ts     — OAuth 2.1: discovery, authorize, token, register endpoints
    auth.ts      — Bearer token middleware (validates against token store)
    persist.ts   — Read/write OAuth tokens to /data/tokens.json
  Dockerfile     — node:20-alpine, npm install + tsc, CMD node dist/server.js
  package.json

Claude Code:
  .claude/skills/ship.md    — /ship skill
  .mcp.json                 — session-travel server entry with bearer token header

Docker:
  Volume:   session-travel-data → /data (OAuth token persistence)
  Network:  traefik-proxy
  Restart:  always
```

`server.ts` is the only file that imports from the others. No circular dependencies.

---

## MCP Tools

| Tool | Called by | Description |
|------|-----------|-------------|
| `ship_context` | Claude Code (`/ship` skill) | Write to context slot. Overwrites. |
| `pickup_context` | Claude.ai voice | Read context slot. Returns error string if empty. |
| `ship_conclusion` | Claude.ai voice | Write structured markdown to conclusion slot. Overwrites. |
| `pickup_conclusion` | Claude Code | Read conclusion slot. Returns error string if empty. |

---

## Conclusion Format

When voice ships the conclusion, Claude.ai synthesizes a structured markdown document:

```markdown
## Summary
[One paragraph: what the context was about, what state it arrived in]

## Decisions
- [Decision 1]
- [Decision 2]

## Next Steps
- [Action item]

## Open Questions
- [Anything unresolved]
```

This format is specified in the `ship_conclusion` tool description so Claude.ai knows what shape to produce.

---

## OAuth 2.1 Flow (one-time setup)

Required endpoints (all mandatory — no optional spikes):

- `GET  /.well-known/oauth-protected-resource` — RFC 9728: resource metadata, points to AS. Claude.ai requires this to discover the auth server from the resource URL.
- `GET  /.well-known/oauth-authorization-server` — RFC 8414: AS metadata (issuer, endpoints, capabilities)
- `GET  /oauth2/authorize` — validates client_id, auto-approves, redirects with code + PKCE state. Binds `resource` parameter to the issued code.
- `POST /oauth2/token` — exchanges code for access + refresh tokens (PKCE validated). Validates `resource` parameter matches. Returns tokens bound to that resource.
- `POST /oauth2/register` — RFC 7591 dynamic client registration. Required: Claude.ai has no UI to paste a pre-configured client_id. ~30 lines; implement from day one.

`resource` parameter: MCP auth spec (post-2025-06-18) requires clients to send `resource=https://session-travel.thisisfine.be` on authorize and token requests. Server must validate it matches and bind issued tokens to that resource URI.

Redirect URIs allowlisted:
- `https://claude.ai/api/mcp/auth_callback`
- `https://claude.com/api/mcp/auth_callback`

Tokens persisted to `/data/tokens.json` via Docker volume using atomic write (tmpfile + rename) to prevent corruption on concurrent refresh from multiple Claude.ai clients. Container restart does not require re-auth.

Security note: auto-approve + allowlisted redirect URIs is the entire security boundary for this personal tool. Acceptable; documented.

---

## Data Flow

### Ship context (Claude Code → voice)

1. `/ship` in Claude Code
2. Skill reads session JSONL, assembles payload (Haiku subagents for tool blocks)
3. POSTs to `ship_context` MCP tool
4. Context slot updated

### Pick up on voice

1. Dani opens Claude.ai, starts voice session
2. "Pick up the session"
3. Claude.ai calls `pickup_context`
4. Server returns payload
5. Voice conversation continues with full context

### Ship conclusion (voice → Claude Code)

1. "Ship the conclusion"
2. Claude.ai synthesizes structured markdown
3. Calls `ship_conclusion`
4. Conclusion slot updated

### Pick up conclusion (Claude Code)

1. Claude Code calls `pickup_conclusion`
2. Gets decision record markdown
3. Work continues

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Empty slot on pickup | Returns message: "No context in slot. Run /ship first." |
| Second ship | Overwrites silently. No confirmation. |
| Haiku summarization failure | Falls back to first 200 chars of raw output + `[summarization failed]` marker. Payload still ships. |
| Payload exceeds 1 MB | `ship_context`/`ship_conclusion` return error. Summarize more aggressively. |
| MCP server unreachable | Tool call fails visibly in Claude Code. Re-run `/ship`. |
| OAuth token expired | Claude.ai auto-refreshes via refresh token. |
| Docker volume wiped | Re-do OAuth dance once. |
| Container restart | OAuth tokens survive. Slots are wiped — re-ship. |

---

## Implementation Notes

1. **Session JSONL path in this container:** `/root` is symlinked to `/data/claude` (per boot-sequence). The `/ship` skill must resolve the canonical path: `~/.claude/projects/<hash>/<session-id>.jsonl` resolves through the symlink to `/data/claude/.claude/projects/...`. Skill should resolve the real path before reading.

2. **Slot size cap:** Both context and conclusion slots capped at 1 MB. `ship_context` and `ship_conclusion` return an error if payload exceeds the limit. Prevents OOM on large sessions.

3. **Tool description as voice prompt:** The `ship_conclusion` tool description is the only nudge Claude.ai voice gets about what format to produce. Verify early that voice surface reads MCP tool descriptions (it does for chat; behavior on voice is thinner — test before assuming).

---

## What This Is Not

- Not multi-user. One token, one Dani.
- Not persistent context storage. Slots are ephemeral.
- Not a voice interface. It bridges to one.
- Not session history. Once picked up, the slot is not cleared (idempotent reads), but there is no log.
