import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../runtime/config.js";

const logDir = path.join(CONFIG.DATA_DIR, "audit-logs");

/**
 * 写入一条审计日志。
 * 日志按日期分文件存放，格式为 JSONL，每条一行。
 *
 * @param event  事件名称（如 PathNotAuthorizedError、permissionRulePersisted）
 * @param details  事件详情
 */
export function auditLog(event: string, details: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...details,
    };
    const logFile = path.join(logDir, `audit-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.warn("[AuditLog] 写入审计日志失败:", err);
  }
}
