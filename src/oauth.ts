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
