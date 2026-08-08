import fs from "node:fs";
import path from "node:path";
import type { CoreRuntimeConfig } from "../runtime/config.js";

/** Creates an audit writer whose output is isolated to one Core runtime. */
export function createAuditLog(config: Readonly<CoreRuntimeConfig>) {
  const logDir = path.join(config.dataDir, "audit-logs");

  return function auditLog(event: string, details: Record<string, unknown>): void {
    try {
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const entry = { timestamp: new Date().toISOString(), event, ...details };
      const logFile = path.join(logDir, `audit-${new Date().toISOString().slice(0, 10)}.jsonl`);
      fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (error) {
      console.warn("[AuditLog] 写入审计日志失败:", error);
    }
  };
}

export type AuditLog = ReturnType<typeof createAuditLog>;
