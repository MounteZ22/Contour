import type { AgentErrorCode, AgentErrorPayload } from "./agent-runtime.js";

export type { AgentErrorCode, AgentErrorPayload };

const ERROR_DEFAULTS: Record<AgentErrorCode, AgentErrorPayload> = {
  invalid_api_key: { code: "invalid_api_key", title: "API Key 无效", message: "当前渠道的 API Key 无效或已过期，请在设置中更新后重试。", canRetry: false, action: "open_settings", httpStatus: 401 },
  rate_limited: { code: "rate_limited", title: "请求过于频繁", message: "模型服务暂时限制了请求频率，请稍等片刻后重试。", canRetry: true, httpStatus: 429 },
  prompt_too_long: { code: "prompt_too_long", title: "对话内容过长", message: "当前对话超出了模型可处理的长度，请减少上下文或新建会话。", canRetry: false, httpStatus: 413 },
  network_error: { code: "network_error", title: "网络连接失败", message: "Contour 暂时无法连接模型服务，请检查网络后重试。", canRetry: true, httpStatus: 503 },
  service_error: { code: "service_error", title: "模型服务暂时不可用", message: "模型服务遇到了临时问题，请稍后重试。", canRetry: true, httpStatus: 502 },
  invalid_model: { code: "invalid_model", title: "模型不可用", message: "当前渠道找不到所选模型，请在设置中检查模型名称。", canRetry: false, action: "open_settings", httpStatus: 400 },
  aborted: { code: "aborted", title: "生成已停止", message: "本次生成已停止，可以继续发送新消息。", canRetry: true, httpStatus: 499 },
  unknown: { code: "unknown", title: "生成失败", message: "发生了未能识别的问题，请重试；若仍然失败，请检查渠道设置。", canRetry: true, httpStatus: 500 },
};

/** 带有稳定错误类型的异常，供运行时和 HTTP 层共同使用。 */
export class TypedAgentError extends Error {
  readonly payload: AgentErrorPayload;

  constructor(code: AgentErrorCode, overrides: Partial<Omit<AgentErrorPayload, "code">> = {}) {
    const payload = { ...ERROR_DEFAULTS[code], ...overrides, code };
    super(payload.message);
    this.name = "TypedAgentError";
    this.payload = payload;
  }
}

function getErrorMessage(error: unknown, depth: number = 0): string {
  if (depth >= 5) return "..."; // 防止深层 cause 链产生超长错误字符串
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return `${error.name} ${error.message} ${cause ? getErrorMessage(cause, depth + 1) : ""}`.trim();
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as Record<string, unknown>;
  for (const key of ["status", "statusCode"]) {
    if (typeof value[key] === "number") return value[key];
  }
  if (value.response && typeof value.response === "object") {
    const status = (value.response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return getErrorStatus(value.cause);
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = error as Record<string, unknown>;
  const code = typeof value.code === "string" ? value.code : "";
  return `${code} ${getErrorCode(value.cause)}`.trim().toLowerCase();
}

export function classifyAgentError(error: unknown): AgentErrorPayload {
  if (error instanceof TypedAgentError) return error.payload;

  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);
  const code = getErrorCode(error);

  if (message.includes("abort") || message.includes("cancelled") || message.includes("canceled") || code.includes("abort_err")) {
    return ERROR_DEFAULTS.aborted;
  }
  if (status === 401 || status === 403 || /invalid.{0,12}(api.?key|x-api-key)|incorrect.{0,12}api.?key|unauthori[sz]ed|authentication/.test(message)) {
    return ERROR_DEFAULTS.invalid_api_key;
  }
  if (status === 429 || /rate.?limit|too many requests|resource_exhausted|quota exceeded/.test(message)) {
    return ERROR_DEFAULTS.rate_limited;
  }
  if (status === 413 || /prompt.{0,12}(too long|length)|context.{0,12}(length|window|limit)|too many tokens|token.{0,12}limit/.test(message)) {
    return ERROR_DEFAULTS.prompt_too_long;
  }
  if (/model.{0,20}(not found|does not exist|invalid|unsupported|unavailable)|invalid.{0,12}model|unknown model/.test(message) || (status === 404 && message.includes("model"))) {
    return ERROR_DEFAULTS.invalid_model;
  }
  if (/enotfound|econnreset|econnrefused|etimedout|eai_again|fetch failed|network|socket|connection reset/.test(`${message} ${code}`)) {
    return ERROR_DEFAULTS.network_error;
  }
  if ((status !== undefined && status >= 500) || /overloaded|service unavailable|bad gateway|gateway timeout|internal server error/.test(message)) {
    return ERROR_DEFAULTS.service_error;
  }
  return ERROR_DEFAULTS.unknown;
}

export function typedAgentError(code: AgentErrorCode, overrides: Partial<Omit<AgentErrorPayload, "code">> = {}): TypedAgentError {
  return new TypedAgentError(code, overrides);
}

export function agentErrorHttpStatus(error: AgentErrorPayload): number {
  return error.httpStatus ?? ERROR_DEFAULTS[error.code].httpStatus ?? 500;
}
