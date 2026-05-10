const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateId(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_ID_RE.test(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: "${String(value)}". Only letters, numbers, hyphens and underscores are allowed (max 64 chars).`
    );
  }
}
