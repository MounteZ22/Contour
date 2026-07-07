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
  next: NextFunction
) {
  // 响应头已发送时（如 SSE 流中断），委托给 Express 默认处理
  if (res.headersSent) {
    return next(err);
  }
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
