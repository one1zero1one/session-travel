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
  const envToken = process.env.BEARER_TOKEN;
  if (envToken && token === envToken) {
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
