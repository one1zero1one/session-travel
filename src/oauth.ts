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

  // RFC 7591: Dynamic Client Registration
  app.post('/oauth2/register', (req, res) => {
    const { redirect_uris, client_name: _name, token_endpoint_auth_method: _auth } = req.body as {
      redirect_uris?: string[];
      client_name?: string;
      token_endpoint_auth_method?: string;
    };

    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0 || !redirect_uris.every(u => ALLOWED_REDIRECT_URIS.includes(u))) {
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
    const client = tokens.clients[client_id];
    if (!client) {
      res.status(400).send('Unknown client_id');
      return;
    }
    if (!client.redirectUris.includes(redirect_uri)) {
      res.status(400).send('redirect_uri mismatch');
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
}
