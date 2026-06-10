export function getErrorStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^(\d{3}):/);
  return match ? Number(match[1]) : null;
}

export function isUnauthorizedError(error: unknown): boolean {
  return getErrorStatus(error) === 401;
}

export function isTransientServerError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 503 || status === 500 || status === 502 || status === 504;
}
