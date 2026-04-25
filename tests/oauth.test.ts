import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomBytes, createHash } from 'crypto';

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
