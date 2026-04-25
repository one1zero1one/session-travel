# session-travel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bidirectional MCP server that bridges Claude Code session context to Claude.ai voice and back, via two in-memory slots and OAuth 2.1.

**Architecture:** TypeScript Express server exposing four MCP tools (ship_context, pickup_context, ship_conclusion, pickup_conclusion) over StreamableHTTP. OAuth 2.1 with PKCE for Claude.ai connector auth; static bearer token for Claude Code. Docker container behind Traefik at session-travel.thisisfine.be. Separate `/ship` Claude Code skill assembles and ships session context.

**Tech Stack:** TypeScript 5, Express 4, @modelcontextprotocol/sdk ^1.20.0, vitest, supertest, node:20-alpine Docker image.

---

## Task 1: Project scaffold + health endpoint

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.dockerignore`
- Create: `src/server.ts` (skeleton only — health route)

- [ ] **Step 1: Initialize git repo**

```bash
cd /media/storage1/projects/session-travel
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "session-travel",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "node --watch --experimental-strip-types src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0",
    "express": "^4.18.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "@types/supertest": "^6.0.0",
    "@types/uuid": "^9.0.0",
    "supertest": "^6.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create .env.example**

```bash
BEARER_TOKEN=change-me-strong-random-token
DOMAIN=session-travel.thisisfine.be
PORT=3000
DATA_DIR=/data
```

- [ ] **Step 5: Create .dockerignore**

```
node_modules
dist
.env
*.test.ts
tests/
```

- [ ] **Step 6: Create src/server.ts skeleton**

```typescript
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = parseInt(process.env.PORT ?? '3000');
app.listen(PORT, () => console.log(`session-travel listening on :${PORT}`));

export { app };
```

- [ ] **Step 7: Install dependencies**

```bash
cd /media/storage1/projects/session-travel
npm install
```

Expected: node_modules created, no errors.

- [ ] **Step 8: Build and verify health**

```bash
npm run build
node dist/server.js &
sleep 1
curl -s http://localhost:3000/health
kill %1
```

Expected: `{"ok":true}`

- [ ] **Step 9: Create .gitignore and initial commit**

```
node_modules/
dist/
.env
*.tmp
```

```bash
git add -A
git commit -m "feat: project scaffold with health endpoint"
```

---

## Task 2: In-memory store

**Files:**
- Create: `src/store.ts`
- Create: `tests/store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setContext, getContext, setConclusion, getConclusion } from '../src/store.js';

describe('store', () => {
  beforeEach(() => {
    // Reset between tests by setting to null via empty string won't work —
    // we'll test that the module resets in isolation. Each test file gets
    // fresh module via vitest isolation.
  });

  it('returns null when context slot is empty', () => {
    expect(getContext()).toBeNull();
  });

  it('stores and retrieves context', () => {
    setContext('hello context');
    expect(getContext()).toBe('hello context');
  });

  it('overwrites context silently', () => {
    setContext('first');
    setContext('second');
    expect(getContext()).toBe('second');
  });

  it('throws when context exceeds 1 MB', () => {
    const big = 'x'.repeat(1_000_001);
    expect(() => setContext(big)).toThrow('exceeds 1 MB');
  });

  it('returns null when conclusion slot is empty', () => {
    expect(getConclusion()).toBeNull();
  });

  it('stores and retrieves conclusion', () => {
    setConclusion('# Decision\n- Do the thing');
    expect(getConclusion()).toBe('# Decision\n- Do the thing');
  });

  it('throws when conclusion exceeds 1 MB', () => {
    const big = 'x'.repeat(1_000_001);
    expect(() => setConclusion(big)).toThrow('exceeds 1 MB');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/store.test.ts
```

Expected: FAIL — `store.ts` not found.

- [ ] **Step 3: Implement src/store.ts**

```typescript
const MAX_BYTES = 1_000_000;

let contextSlot: string | null = null;
let conclusionSlot: string | null = null;

function checkSize(payload: string, label: string): void {
  if (Buffer.byteLength(payload, 'utf8') > MAX_BYTES) {
    throw new Error(`${label} payload exceeds 1 MB limit`);
  }
}

export function setContext(payload: string): void {
  checkSize(payload, 'context');
  contextSlot = payload;
}

export function getContext(): string | null {
  return contextSlot;
}

export function setConclusion(payload: string): void {
  checkSize(payload, 'conclusion');
  conclusionSlot = payload;
}

export function getConclusion(): string | null {
  return conclusionSlot;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/store.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts tests/store.test.ts
git commit -m "feat: two-slot in-memory store with 1 MB cap"
```

---

## Task 3: Token persistence

**Files:**
- Create: `src/persist.ts`
- Create: `tests/persist.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/persist.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Use a temp dir per test run
const TEST_DIR = join(tmpdir(), `st-test-${randomUUID()}`);

// Override DATA_DIR before importing
process.env.DATA_DIR = TEST_DIR;

const { loadTokens, saveTokens } = await import('../src/persist.js');

describe('persist', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    const tokenFile = join(TEST_DIR, 'tokens.json');
    if (existsSync(tokenFile)) rmSync(tokenFile);
  });

  it('returns empty store when file does not exist', () => {
    const tokens = loadTokens();
    expect(tokens.accessTokens).toEqual({});
    expect(tokens.refreshTokens).toEqual({});
    expect(tokens.clients).toEqual({});
    expect(tokens.authCodes).toEqual({});
  });

  it('saves and loads tokens', () => {
    const tokens = loadTokens();
    tokens.clients['client-1'] = { redirectUris: ['https://example.com/cb'] };
    saveTokens(tokens);

    const loaded = loadTokens();
    expect(loaded.clients['client-1']).toEqual({ redirectUris: ['https://example.com/cb'] });
  });

  it('atomic write: file is valid JSON after save', () => {
    const tokens = loadTokens();
    tokens.accessTokens['tok'] = { clientId: 'c1', expiresAt: 9999999999999, resource: 'https://x.com' };
    saveTokens(tokens);

    const { readFileSync } = await import('fs');
    const raw = readFileSync(join(TEST_DIR, 'tokens.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/persist.test.ts
```

Expected: FAIL — `persist.ts` not found.

- [ ] **Step 3: Implement src/persist.ts**

```typescript
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const TOKENS_FILE = join(DATA_DIR, 'tokens.json');

export interface TokenRecord {
  clientId: string;
  expiresAt: number;
  resource: string;
}

export interface RefreshRecord {
  clientId: string;
  resource: string;
}

export interface ClientRecord {
  redirectUris: string[];
}

export interface AuthCodeRecord {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  resource: string;
  expiresAt: number;
}

export interface TokenStore {
  accessTokens: Record<string, TokenRecord>;
  refreshTokens: Record<string, RefreshRecord>;
  clients: Record<string, ClientRecord>;
  authCodes: Record<string, AuthCodeRecord>;
}

const EMPTY: TokenStore = {
  accessTokens: {},
  refreshTokens: {},
  clients: {},
  authCodes: {},
};

let cache: TokenStore | null = null;

export function loadTokens(): TokenStore {
  if (cache) return cache;
  if (!existsSync(TOKENS_FILE)) {
    cache = structuredClone(EMPTY);
    return cache;
  }
  cache = JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) as TokenStore;
  return cache;
}

export function saveTokens(tokens: TokenStore): void {
  cache = tokens;
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${TOKENS_FILE}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(tokens, null, 2), 'utf8');
  renameSync(tmp, TOKENS_FILE);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/persist.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/persist.ts tests/persist.test.ts
git commit -m "feat: atomic token persistence with in-memory cache"
```

---

## Task 4: Bearer auth middleware

**Files:**
- Create: `src/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.BEARER_TOKEN = 'test-static-token';
process.env.DATA_DIR = '/tmp/st-auth-test';

const { bearerAuth } = await import('../src/auth.js');

function makeApp() {
  const app = express();
  app.get('/protected', bearerAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('bearerAuth', () => {
  it('rejects missing Authorization header', async () => {
    const res = await request(makeApp()).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects non-Bearer scheme', async () => {
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('accepts valid static bearer token', async () => {
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer test-static-token');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects wrong static token', async () => {
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/auth.test.ts
```

Expected: FAIL — `auth.ts` not found.

- [ ] **Step 3: Implement src/auth.ts**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { loadTokens } from './persist.js';

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const token = header.slice(7);

  // Static bearer token for Claude Code
  if (token === process.env.BEARER_TOKEN) {
    next();
    return;
  }

  // OAuth access token for Claude.ai
  const tokens = loadTokens();
  const record = tokens.accessTokens[token];
  if (record && record.expiresAt > Date.now()) {
    next();
    return;
  }

  res.status(401).json({ error: 'unauthorized' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/auth.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: bearer auth middleware (static token + OAuth tokens)"
```

---

## Task 5: OAuth discovery endpoints

**Files:**
- Create: `src/oauth.ts` (discovery only — more endpoints added in Tasks 6 and 7)
- Create: `tests/oauth.test.ts` (discovery tests — more tests added in Tasks 6 and 7)

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/oauth.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.DOMAIN = 'session-travel.thisisfine.be';
process.env.DATA_DIR = '/tmp/st-oauth-test';

const { registerOAuthRoutes } = await import('../src/oauth.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  registerOAuthRoutes(app);
  return app;
}

describe('OAuth discovery', () => {
  it('GET /.well-known/oauth-protected-resource returns resource metadata', async () => {
    const res = await request(makeApp()).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe('https://session-travel.thisisfine.be');
    expect(res.body.authorization_servers).toContain('https://session-travel.thisisfine.be');
  });

  it('GET /.well-known/oauth-authorization-server returns AS metadata', async () => {
    const res = await request(makeApp()).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBe('https://session-travel.thisisfine.be');
    expect(res.body.authorization_endpoint).toBe('https://session-travel.thisisfine.be/oauth2/authorize');
    expect(res.body.token_endpoint).toBe('https://session-travel.thisisfine.be/oauth2/token');
    expect(res.body.registration_endpoint).toBe('https://session-travel.thisisfine.be/oauth2/register');
    expect(res.body.code_challenge_methods_supported).toContain('S256');
    expect(res.body.grant_types_supported).toContain('authorization_code');
    expect(res.body.grant_types_supported).toContain('refresh_token');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/oauth.test.ts
```

Expected: FAIL — `oauth.ts` not found.

- [ ] **Step 3: Implement src/oauth.ts (discovery only)**

```typescript
import type { Express } from 'express';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { loadTokens, saveTokens } from './persist.js';

const DOMAIN = process.env.DOMAIN ?? 'session-travel.thisisfine.be';
const BASE = `https://${DOMAIN}`;

const ALLOWED_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

export function registerOAuthRoutes(app: Express): void {
  // RFC 9728: protected resource metadata
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: BASE,
      authorization_servers: [BASE],
    });
  });

  // RFC 8414: authorization server metadata
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth2/authorize`,
      token_endpoint: `${BASE}/oauth2/token`,
      registration_endpoint: `${BASE}/oauth2/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/oauth.test.ts
```

Expected: 2 discovery tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/oauth.ts tests/oauth.test.ts
git commit -m "feat: OAuth 2.1 discovery endpoints (protected-resource + AS metadata)"
```

---

## Task 6: OAuth registration and authorization

**Files:**
- Modify: `src/oauth.ts` — add /oauth2/register and /oauth2/authorize
- Modify: `tests/oauth.test.ts` — add registration and authorization tests

- [ ] **Step 1: Add failing tests to tests/oauth.test.ts**

Add these test blocks after the discovery describe block:

```typescript
describe('OAuth registration (DCR)', () => {
  it('registers a client with valid redirect_uris', async () => {
    const res = await request(makeApp())
      .post('/oauth2/register')
      .send({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        client_name: 'Claude.ai',
        token_endpoint_auth_method: 'none',
      });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toBeTruthy();
    expect(res.body.redirect_uris).toContain('https://claude.ai/api/mcp/auth_callback');
    expect(res.body.grant_types).toContain('authorization_code');
  });

  it('rejects registration with disallowed redirect_uri', async () => {
    const res = await request(makeApp())
      .post('/oauth2/register')
      .send({
        redirect_uris: ['https://evil.com/callback'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_redirect_uri');
  });
});

describe('OAuth authorization', () => {
  it('auto-approves and redirects with code', async () => {
    // First register a client
    const regRes = await request(makeApp())
      .post('/oauth2/register')
      .send({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    const clientId = regRes.body.client_id;

    // Generate PKCE values
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const authRes = await request(makeApp())
      .get('/oauth2/authorize')
      .query({
        client_id: clientId,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'test-state',
        resource: 'https://session-travel.thisisfine.be',
        response_type: 'code',
      });

    expect(authRes.status).toBe(302);
    const location = new URL(authRes.headers.location);
    expect(location.searchParams.get('code')).toBeTruthy();
    expect(location.searchParams.get('state')).toBe('test-state');
  });

  it('rejects unknown client_id', async () => {
    const authRes = await request(makeApp())
      .get('/oauth2/authorize')
      .query({ client_id: 'nonexistent', redirect_uri: 'https://claude.ai/api/mcp/auth_callback' });
    expect(authRes.status).toBe(400);
  });
});
```

Also add this import at the top of the test file:

```typescript
import { randomBytes, createHash } from 'crypto';
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npm test -- tests/oauth.test.ts
```

Expected: discovery tests PASS, new registration/authorization tests FAIL.

- [ ] **Step 3: Add /oauth2/register and /oauth2/authorize to src/oauth.ts**

Inside the `registerOAuthRoutes` function, after the discovery routes:

```typescript
  // RFC 7591: Dynamic Client Registration
  app.post('/oauth2/register', (req, res) => {
    const { redirect_uris, client_name: _name, token_endpoint_auth_method: _auth } = req.body as {
      redirect_uris?: string[];
      client_name?: string;
      token_endpoint_auth_method?: string;
    };

    if (!Array.isArray(redirect_uris) || !redirect_uris.every(u => ALLOWED_REDIRECT_URIS.includes(u))) {
      res.status(400).json({ error: 'invalid_redirect_uri' });
      return;
    }

    const clientId = randomUUID();
    const tokens = loadTokens();
    tokens.clients[clientId] = { redirectUris: redirect_uris };
    saveTokens(tokens);

    res.status(201).json({
      client_id: clientId,
      redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  // Authorization endpoint — auto-approve (single user)
  app.get('/oauth2/authorize', (req, res) => {
    const { client_id, redirect_uri, code_challenge, code_challenge_method, state, resource } =
      req.query as Record<string, string>;

    const tokens = loadTokens();
    if (!tokens.clients[client_id]) {
      res.status(400).send('Unknown client_id');
      return;
    }

    const code = randomBytes(32).toString('hex');
    tokens.authCodes[code] = {
      clientId: client_id,
      codeChallenge: code_challenge ?? '',
      codeChallengeMethod: code_challenge_method ?? 'S256',
      redirectUri: redirect_uri,
      resource: resource ?? BASE,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    saveTokens(tokens);

    const location = new URL(redirect_uri);
    location.searchParams.set('code', code);
    if (state) location.searchParams.set('state', state);
    res.redirect(location.toString());
  });
```

- [ ] **Step 4: Run all OAuth tests to verify they pass**

```bash
npm test -- tests/oauth.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/oauth.ts tests/oauth.test.ts
git commit -m "feat: OAuth DCR registration and auto-approve authorization endpoint"
```

---

## Task 7: OAuth token endpoint

**Files:**
- Modify: `src/oauth.ts` — add /oauth2/token
- Modify: `tests/oauth.test.ts` — add full PKCE flow test

- [ ] **Step 1: Add failing token endpoint tests**

Add this describe block to `tests/oauth.test.ts`:

```typescript
describe('OAuth token endpoint', () => {
  async function fullAuthFlow(app: ReturnType<typeof makeApp>) {
    // Register
    const regRes = await request(app)
      .post('/oauth2/register')
      .send({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    const clientId = regRes.body.client_id;

    // Generate PKCE
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    // Authorize
    const authRes = await request(app)
      .get('/oauth2/authorize')
      .query({
        client_id: clientId,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: 'https://session-travel.thisisfine.be',
        response_type: 'code',
      });
    const code = new URL(authRes.headers.location).searchParams.get('code')!;

    return { clientId, verifier, code };
  }

  it('exchanges code for tokens with valid PKCE', async () => {
    const app = makeApp();
    const { verifier, code } = await fullAuthFlow(app);

    const tokenRes = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: 'https://session-travel.thisisfine.be',
      });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeTruthy();
    expect(tokenRes.body.refresh_token).toBeTruthy();
    expect(tokenRes.body.token_type).toBe('Bearer');
    expect(tokenRes.body.expires_in).toBe(3600);
  });

  it('rejects wrong code_verifier', async () => {
    const app = makeApp();
    const { code } = await fullAuthFlow(app);

    const tokenRes = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        code_verifier: 'wrong-verifier',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      });

    expect(tokenRes.status).toBe(400);
    expect(tokenRes.body.error).toBe('invalid_grant');
  });

  it('refreshes an access token', async () => {
    const app = makeApp();
    const { verifier, code } = await fullAuthFlow(app);

    const tokenRes = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      });

    const refreshToken = tokenRes.body.refresh_token;

    const refreshRes = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.access_token).toBeTruthy();
    expect(refreshRes.body.access_token).not.toBe(tokenRes.body.access_token);
  });

  it('rejects invalid refresh token', async () => {
    const res = await request(makeApp())
      .post('/oauth2/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- tests/oauth.test.ts
```

Expected: new token tests FAIL.

- [ ] **Step 3: Add /oauth2/token to src/oauth.ts**

Inside `registerOAuthRoutes`, after the authorize endpoint:

```typescript
  // Token endpoint
  app.post('/oauth2/token', (req, res) => {
    const body = req.body as Record<string, string>;
    const { grant_type } = body;
    const tokens = loadTokens();

    if (grant_type === 'authorization_code') {
      const { code, code_verifier, redirect_uri } = body;
      const codeRecord = tokens.authCodes[code];

      if (!codeRecord || codeRecord.expiresAt < Date.now()) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      // Validate PKCE S256
      const expected = createHash('sha256').update(code_verifier ?? '').digest('base64url');
      if (expected !== codeRecord.codeChallenge) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      delete tokens.authCodes[code];

      const accessToken = randomBytes(32).toString('hex');
      const refreshToken = randomBytes(32).toString('hex');

      tokens.accessTokens[accessToken] = {
        clientId: codeRecord.clientId,
        expiresAt: Date.now() + 60 * 60 * 1000,
        resource: codeRecord.resource,
      };
      tokens.refreshTokens[refreshToken] = {
        clientId: codeRecord.clientId,
        resource: codeRecord.resource,
      };

      saveTokens(tokens);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refreshToken,
      });
      return;
    }

    if (grant_type === 'refresh_token') {
      const { refresh_token } = body;
      const refreshRecord = tokens.refreshTokens[refresh_token];

      if (!refreshRecord) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      const accessToken = randomBytes(32).toString('hex');
      tokens.accessTokens[accessToken] = {
        clientId: refreshRecord.clientId,
        expiresAt: Date.now() + 60 * 60 * 1000,
        resource: refreshRecord.resource,
      };

      saveTokens(tokens);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refresh_token,
      });
      return;
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });
```

- [ ] **Step 4: Run all OAuth tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS (store, persist, auth, oauth).

- [ ] **Step 5: Commit**

```bash
git add src/oauth.ts tests/oauth.test.ts
git commit -m "feat: OAuth token endpoint with PKCE validation and refresh tokens"
```

---

## Task 8: MCP server and tools

**Files:**
- Modify: `src/server.ts` — add MCP endpoint with 4 tools, wire OAuth and auth middleware

- [ ] **Step 1: Replace src/server.ts with full implementation**

```typescript
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { setContext, getContext, setConclusion, getConclusion } from './store.js';
import { bearerAuth } from './auth.js';
import { registerOAuthRoutes } from './oauth.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// OAuth endpoints (no auth required — they're the auth layer)
registerOAuthRoutes(app);

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// MCP endpoint — bearer auth gates all tool calls
app.all('/mcp', bearerAuth, async (req, res) => {
  const server = new Server(
    { name: 'session-travel', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'ship_context',
        description:
          'Ship the current Claude Code session context to the bridge so it can be picked up in a voice session. Call with the assembled session payload.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            payload: { type: 'string', description: 'Assembled session context (conversation thread with tool summaries)' },
          },
          required: ['payload'],
        },
      },
      {
        name: 'pickup_context',
        description:
          'Pick up the session context shipped from Claude Code. Call this at the start of a voice session to load the context. Returns the full context payload or an error message if the slot is empty.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'ship_conclusion',
        description:
          'Ship the voice session conclusion back to Claude Code. Synthesize and send a structured markdown document with this exact format:\n\n## Summary\n[One paragraph: what arrived and what was discussed]\n\n## Decisions\n- [Each decision made]\n\n## Next Steps\n- [Each action item]\n\n## Open Questions\n- [Anything unresolved]\n\nCall this tool with the synthesized markdown as the payload.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            payload: { type: 'string', description: 'Structured markdown conclusion document' },
          },
          required: ['payload'],
        },
      },
      {
        name: 'pickup_conclusion',
        description:
          'Pick up the conclusion shipped from a voice session. Returns the decision record markdown or an error message if no conclusion has been shipped yet.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'ship_context': {
        try {
          setContext(args?.payload as string);
          return { content: [{ type: 'text' as const, text: 'Context slot updated. Ready for voice pickup.' }] };
        } catch (e: unknown) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }

      case 'pickup_context': {
        const ctx = getContext();
        if (!ctx) {
          return {
            content: [{ type: 'text' as const, text: 'No context in slot. Run /ship from Claude Code first.' }],
          };
        }
        return { content: [{ type: 'text' as const, text: ctx }] };
      }

      case 'ship_conclusion': {
        try {
          setConclusion(args?.payload as string);
          return { content: [{ type: 'text' as const, text: 'Conclusion slot updated. Pick it up from Claude Code.' }] };
        } catch (e: unknown) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }

      case 'pickup_conclusion': {
        const conclusion = getConclusion();
        if (!conclusion) {
          return {
            content: [{ type: 'text' as const, text: 'No conclusion in slot. Ship one from a voice session first.' }],
          };
        }
        return { content: [{ type: 'text' as const, text: conclusion }] };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = parseInt(process.env.PORT ?? '3000');
app.listen(PORT, () => console.log(`session-travel listening on :${PORT}`));

export { app };
```

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
npm run build
```

Expected: no TypeScript errors, `dist/` populated.

- [ ] **Step 3: Start server and test health + auth**

```bash
BEARER_TOKEN=local-test-token DOMAIN=localhost PORT=3000 node dist/server.js &
sleep 1

# Health (no auth required)
curl -s http://localhost:3000/health

# MCP without auth — should 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# MCP with auth — should get tool list
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

kill %1
```

Expected:
- Health: `{"ok":true}`
- No auth: `401`
- With auth: JSON response containing `ship_context`, `pickup_context`, `ship_conclusion`, `pickup_conclusion`

- [ ] **Step 4: Test the four tools with curl**

```bash
BEARER_TOKEN=local-test-token DOMAIN=localhost PORT=3000 node dist/server.js &
sleep 1
AUTH="-H 'Authorization: Bearer local-test-token'"
MCP="http://localhost:3000/mcp"

# ship_context
curl -s -X POST $MCP \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ship_context","arguments":{"payload":"Hello from Claude Code"}}}'

# pickup_context
curl -s -X POST $MCP \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-token" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pickup_context","arguments":{}}}'

# ship_conclusion
curl -s -X POST $MCP \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-token" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ship_conclusion","arguments":{"payload":"## Summary\nWe decided things.\n\n## Decisions\n- Do it"}}}'

# pickup_conclusion
curl -s -X POST $MCP \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-token" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"pickup_conclusion","arguments":{}}}'

kill %1
```

Expected: each tool returns the correct text response — context/conclusion lands in slots and is retrievable.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/server.ts
git commit -m "feat: MCP server with four tools over StreamableHTTP"
```

---

## Task 9: Docker and Traefik deployment

**Files:**
- Create: `Dockerfile`
- Modify: `/homeassistant/docker/docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm install typescript --save-dev && npx tsc && npm uninstall typescript
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Build and smoke-test the Docker image locally**

```bash
cd /media/storage1/projects/session-travel
docker build -t session-travel:local .
docker run --rm -d \
  -p 3100:3000 \
  -e BEARER_TOKEN=docker-test \
  -e DOMAIN=localhost \
  --name st-test \
  session-travel:local
sleep 2
curl -s http://localhost:3100/health
docker stop st-test
```

Expected: `{"ok":true}` from the containerized server.

- [ ] **Step 3: Create Docker volume for token persistence**

```bash
docker volume create session-travel-data
```

- [ ] **Step 4: Add service to docker-compose.yml**

Open `/homeassistant/docker/docker-compose.yml` and add this service in the `services:` block (alongside other services):

```yaml
  session-travel:
    image: session-travel:local
    container_name: session-travel
    restart: always
    environment:
      - BEARER_TOKEN=${SESSION_TRAVEL_BEARER_TOKEN}
      - DOMAIN=session-travel.thisisfine.be
      - PORT=3000
      - DATA_DIR=/data
    volumes:
      - session-travel-data:/data
    networks:
      - traefik-proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.session-travel.rule=Host(`session-travel.thisisfine.be`)"
      - "traefik.http.routers.session-travel.entrypoints=websecure"
      - "traefik.http.routers.session-travel.tls.certresolver=letsencrypt"
      - "traefik.http.services.session-travel.loadbalancer.server.port=3000"
```

Also add the volume in the top-level `volumes:` block:

```yaml
  session-travel-data:
```

- [ ] **Step 5: Set the bearer token env var and deploy**

```bash
# Generate a strong bearer token
openssl rand -hex 32
# Copy the output — this is SESSION_TRAVEL_BEARER_TOKEN

# Add to the environment (or to a .env file in the docker-compose directory)
export SESSION_TRAVEL_BEARER_TOKEN=<the-token-you-generated>

cd /homeassistant/docker
docker-compose up -d session-travel
docker-compose logs session-travel
```

Expected: `session-travel listening on :3000` in logs.

- [ ] **Step 6: Verify public HTTPS endpoint**

```bash
# Wait ~30 seconds for TLS cert to provision if first deployment
curl -s https://session-travel.thisisfine.be/health
```

Expected: `{"ok":true}` over HTTPS.

- [ ] **Step 7: Test MCP tools via public URL**

```bash
TOKEN=<SESSION_TRAVEL_BEARER_TOKEN>
curl -s -X POST https://session-travel.thisisfine.be/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: JSON with all four tools listed.

- [ ] **Step 8: Commit docker-compose change**

```bash
cd /homeassistant/docker
git add docker-compose.yml
git commit -m "feat: add session-travel service with Traefik HTTPS"
```

Also commit the Dockerfile:

```bash
cd /media/storage1/projects/session-travel
git add Dockerfile
git commit -m "feat: Dockerfile for session-travel"
```

---

## Task 10: /ship skill

**Files:**
- Create: `~/.claude/skills/ship.md` (global Claude Code skill)

The exact global skills path may vary. Verify with:

```bash
ls ~/.claude/
```

Look for a `skills/`, `commands/`, or `plugins/` directory. If none exists, create `~/.claude/skills/`.

- [ ] **Step 1: Verify the global skills directory**

```bash
ls ~/.claude/
mkdir -p ~/.claude/skills
```

- [ ] **Step 2: Find the current session JSONL format**

Before writing the skill, inspect a real JSONL file to understand the format:

```bash
# Find the most recent JSONL in any project
find ~/.claude/projects -name "*.jsonl" -type f | xargs ls -t 2>/dev/null | head -3
```

Pick one path and inspect the first few lines:

```bash
head -3 <path-to-jsonl> | python3 -m json.tool
```

Note the structure: what are the top-level fields? Is `role` at the top level or nested? Are tool calls inside `content` arrays? This informs how the skill parses turns.

- [ ] **Step 3: Create ~/.claude/skills/ship.md**

```markdown
# /ship — Ship Session Context to Voice Bridge

Ship the current Claude Code session context to session-travel so it can be picked up in a voice session on Claude.ai.

## Process

### Step 1: Find the current session JSONL

Run this bash command to find the most recent session file for the current project:

```bash
find ~/.claude/projects -name "*.jsonl" -type f -newer ~/.claude/projects -maxdepth 3 | xargs ls -t 2>/dev/null | head -1
```

If that returns nothing, fall back to:

```bash
find ~/.claude/projects -name "*.jsonl" -type f | xargs ls -t 2>/dev/null | head -1
```

Read the file using the Read tool.

### Step 2: Parse and assemble the conversation payload

Process each JSONL line:

- **Human message** (role: "user" or "human", type: "human"): Extract all text content blocks verbatim. Skip tool_result blocks.
- **Assistant message** (role: "assistant"): Extract all text content blocks verbatim. For each tool_use block, spawn a Haiku subagent (see Step 3). Skip other block types.
- **System messages or metadata lines**: Skip entirely.

Format each turn as:

```
[Human]
<verbatim text>

[Assistant]
<verbatim text>
<tool summary line(s)>
```

### Step 3: Summarize tool calls with Haiku

For each tool_use + tool_result pair found in assistant messages, spawn a subagent with model haiku and this prompt:

```
Summarize this tool call in ONE line (max 120 chars):
Tool: <tool_name>
Input: <first 300 chars of input JSON>
Output: <first 500 chars of output/result>

Format: "[tool_name] → <what it did and key result>"
Example: "[Read] → read src/auth.ts, found JWT validation on line 45"
```

Replace the tool_use/tool_result pair in the assembled output with the single summary line.

### Step 4: Ship the payload

Call the `ship_context` MCP tool with the assembled conversation thread as the `payload` argument.

Confirm to the user: "Shipped. Context slot updated at session-travel.thisisfine.be — ready for voice pickup."

## Notes

- If the JSONL file cannot be found, tell the user and stop. Do not guess.
- If a tool call summarization fails, use: `[<tool_name>] → [summarization failed — skipped]`
- If the assembled payload would exceed 1 MB, warn the user and truncate to the most recent turns that fit.
- The session-travel MCP server must be configured in .mcp.json (see Task 11) for ship_context to be available as a tool.
```

- [ ] **Step 4: Verify the skill is discoverable**

In any Claude Code session, type `/ship` and verify Claude Code offers to run it. If not found, check the skills directory path.

---

## Task 11: Claude Code MCP configuration

**Files:**
- Create or modify: `.mcp.json` in the current project (or globally at `~/.claude/mcp.json`)

The session-travel MCP server should be configured globally so `/ship` works from any project.

- [ ] **Step 1: Check if global MCP config exists**

```bash
ls ~/.claude/mcp.json 2>/dev/null || echo "not found"
```

- [ ] **Step 2: Add session-travel server to MCP config**

If `~/.claude/mcp.json` exists, add the session-travel entry to the `mcpServers` object.

If it does not exist, create it:

```json
{
  "mcpServers": {
    "session-travel": {
      "type": "http",
      "url": "https://session-travel.thisisfine.be/mcp",
      "headers": {
        "Authorization": "Bearer <SESSION_TRAVEL_BEARER_TOKEN>"
      }
    }
  }
}
```

Replace `<SESSION_TRAVEL_BEARER_TOKEN>` with the token generated in Task 9 Step 5.

- [ ] **Step 3: Verify Claude Code sees the tools**

Restart Claude Code (or reload MCP servers). Then in a Claude Code session, ask:

> "What tools do you have from session-travel?"

Expected: Claude Code lists `ship_context`, `pickup_context`, `ship_conclusion`, `pickup_conclusion`.

---

## Task 12: End-to-end smoke test

Manual test of the full round-trip before connecting Claude.ai.

- [ ] **Step 1: Test full context round-trip with curl**

```bash
TOKEN=<SESSION_TRAVEL_BEARER_TOKEN>
BASE=https://session-travel.thisisfine.be

# 1. Ship a test context
curl -s -X POST $BASE/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ship_context","arguments":{"payload":"[Human]\nRefactor the auth middleware\n\n[Assistant]\nHere is the plan...\n[Read] → read src/auth.ts, found JWT logic\n"}}}'

# 2. Pick it up (simulating voice)
curl -s -X POST $BASE/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pickup_context","arguments":{}}}'

# 3. Ship a conclusion (simulating voice)
curl -s -X POST $BASE/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ship_conclusion","arguments":{"payload":"## Summary\nDiscussed auth refactor approach.\n\n## Decisions\n- Use middleware pattern\n- Keep JWT validation in auth.ts\n\n## Next Steps\n- Implement bearerAuth function\n\n## Open Questions\n- Token expiry strategy"}}}'

# 4. Pick up conclusion (back in Claude Code)
curl -s -X POST $BASE/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"pickup_conclusion","arguments":{}}}'
```

Expected: steps 2 and 4 return the payloads from steps 1 and 3 respectively.

- [ ] **Step 2: Connect Claude.ai custom connector**

1. Open Claude.ai on desktop (easier to complete OAuth dance than mobile first)
2. Go to Settings → Integrations (or Connections) → Add custom connector
3. Enter URL: `https://session-travel.thisisfine.be`
4. Claude.ai fetches discovery → opens authorize URL in browser
5. Server auto-approves → redirects back to Claude.ai
6. Connector is now active

If the connector setup fails, check the container logs:
```bash
docker logs session-travel --tail 50
```

- [ ] **Step 3: Test voice pickup**

In a Claude.ai conversation (text first, then voice):

> "Pick up the session from the bridge"

Expected: Claude calls `pickup_context` and returns the context payload.

- [ ] **Step 4: Test /ship from Claude Code**

In any Claude Code session:

> /ship

Expected: Claude Code reads the JSONL, assembles the payload (Haiku summarizes tool blocks), calls `ship_context`, confirms "Shipped."

- [ ] **Step 5: Final git tag**

```bash
cd /media/storage1/projects/session-travel
git tag v1.0.0
```
