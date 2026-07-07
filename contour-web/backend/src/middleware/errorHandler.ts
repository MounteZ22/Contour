import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../vault/validate.js';

/**
 * Express 全局错误处理中间件
 * 统一捕获路由中未处理的错误，避免信息泄露
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
) {
  // 已知的业务错误
  if (err instanceof ValidationError) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  // 未知错误，记录日志但不暴露详情
  console.error(`[未处理错误] ${req.method} ${req.path}:`, err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}
