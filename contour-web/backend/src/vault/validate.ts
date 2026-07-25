const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/** docId 校验：允许中文、连字符、下划线，无最大长度限制 */
const DOC_ID_RE = /^[a-zA-Z0-9\-_一-鿿]+$/;

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

/** 校验 docId：允许中文、连字符、下划线，与 docs 路由的正则保持一致 */
export function validateDocId(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !DOC_ID_RE.test(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: "${String(value)}". 只允许字母、数字、连字符、下划线和中文。`
    );
  }
}
