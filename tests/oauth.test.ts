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
