import type { ToolActivity } from '../../state/aiApi';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled'
  | 'error';

export interface TaskProgressItem {
  id: string;
  subject: string;
  status: TaskStatus;
  activeForm?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function parseTaskCreateResult(result: string | undefined): { id: string; subject?: string } | null {
  if (!result) return null;

  try {
    const parsed: unknown = JSON.parse(result);
    if (!isRecord(parsed)) return null;
    const task = isRecord(parsed.task) ? parsed.task : parsed;
    const id = asString(task.id ?? task.taskId ?? task.task_id);
    if (!id) return null;
    return { id, subject: typeof task.subject === 'string' ? task.subject : undefined };
  } catch {
    return null;
  }
}

function toTaskStatus(value: unknown, fallback: TaskStatus): TaskStatus {
  if (
    value === 'pending'
    || value === 'in_progress'
    || value === 'completed'
    || value === 'blocked'
    || value === 'cancelled'
    || value === 'error'
  ) {
    return value;
  }
  return fallback;
}

/**
 * 聚合当前轮 TaskCreate/TaskUpdate 工具调用。
 *
 * 任务工具的输出来自 SDK，格式并非每次都完整，因此无法识别时直接忽略或使用
 * 当前工具调用 ID 作为临时 ID，避免把无关的工具结果展示为任务进度。
 */
export function aggregateTaskProgress(activities: ToolActivity[]): TaskProgressItem[] {
  const tasks = new Map<string, TaskProgressItem>();
  const createCalls = new Map<string, { id: string; subject?: string }>();

  for (const activity of activities) {
    if (activity.toolName !== 'TaskCreate') continue;
    const parsed = parseTaskCreateResult(activity.result);
    const id = parsed?.id ?? activity.id;
    if (id) createCalls.set(activity.id ?? id, { id, subject: parsed?.subject });
  }

  for (const activity of activities) {
    const input = activity.input;
    if (!input) continue;

    if (activity.toolName === 'TaskCreate') {
      const create = createCalls.get(activity.id ?? '') ?? {
        id: activity.id,
        subject: undefined,
      };
      if (!create.id) continue;
      tasks.set(create.id, {
        id: create.id,
        subject: typeof input.subject === 'string'
          ? input.subject
          : create.subject ?? (typeof input.description === 'string' ? input.description : '未命名任务'),
        status: 'pending',
        activeForm: typeof input.activeForm === 'string' ? input.activeForm : undefined,
      });
      continue;
    }

    if (activity.toolName !== 'TaskUpdate') continue;
    const id = asString(input.taskId ?? input.task_id ?? input.id);
    if (!id) continue;
    const existing = tasks.get(id);
    tasks.set(id, {
      id,
      subject: typeof input.subject === 'string'
        ? input.subject
        : existing?.subject ?? `任务 #${id}`,
      status: toTaskStatus(input.status, existing?.status ?? 'pending'),
      activeForm: typeof input.activeForm === 'string' ? input.activeForm : existing?.activeForm,
    });
  }

  return Array.from(tasks.values());
}

export function isTaskFailure(status: TaskStatus): boolean {
  return status === 'blocked' || status === 'cancelled' || status === 'error';
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'error';
}
