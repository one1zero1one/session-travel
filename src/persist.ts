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
