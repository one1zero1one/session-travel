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
