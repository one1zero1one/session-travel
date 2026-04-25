import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { saveTokens, loadTokens, _resetCache } from '../src/persist.js';

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

describe('bearerAuth OAuth tokens', () => {
  beforeEach(() => {
    _resetCache();
  });

  it('accepts a valid, non-expired OAuth access token', async () => {
    const tokens = loadTokens();
    tokens.accessTokens['valid-oauth-token'] = {
      clientId: 'c1',
      expiresAt: Date.now() + 3600_000,
      resource: 'https://session-travel.thisisfine.be',
    };
    saveTokens(tokens);

    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer valid-oauth-token');
    expect(res.status).toBe(200);
  });

  it('rejects an expired OAuth access token', async () => {
    const tokens = loadTokens();
    tokens.accessTokens['expired-token'] = {
      clientId: 'c1',
      expiresAt: Date.now() - 1000, // expired 1 second ago
      resource: 'https://session-travel.thisisfine.be',
    };
    saveTokens(tokens);

    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer expired-token');
    expect(res.status).toBe(401);
  });
});
