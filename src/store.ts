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

export function resetStore(): void {
  contextSlot = null;
  conclusionSlot = null;
}
