/**
 * 当前 Agent 请求内的可见任务进度工具。
 *
 * 任务只服务于一轮长任务的前端进度展示：每次创建工具数组都会得到新的闭包，
 * 不读取、不写入文件，也不跨请求保留状态。
 */

import { Type, type Static } from "typebox";

const MAX_SUBJECT_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_ACTIVE_FORM_LENGTH = 160;
const TASK_ID_PATTERN = "^[1-9][0-9]*$";

const taskStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("blocked"),
  Type.Literal("cancelled"),
  Type.Literal("error"),
]);

const taskCreateParams = Type.Object({
  subject: Type.String({
    minLength: 1,
    maxLength: MAX_SUBJECT_LENGTH,
    description: "任务标题，简洁说明一个可观察的工作项。",
  }),
  description: Type.Optional(Type.String({
    maxLength: MAX_DESCRIPTION_LENGTH,
    description: "可选的任务说明。",
  })),
  activeForm: Type.Optional(Type.String({
    maxLength: MAX_ACTIVE_FORM_LENGTH,
    description: "进行中时展示的动词短语，例如“正在核对实验数据”。",
  })),
}, { additionalProperties: false });

const taskUpdateParams = Type.Object({
  taskId: Type.String({
    pattern: TASK_ID_PATTERN,
    description: "TaskCreate 返回的任务 ID。",
  }),
  status: Type.Optional(taskStatusSchema),
  subject: Type.Optional(Type.String({
    minLength: 1,
    maxLength: MAX_SUBJECT_LENGTH,
    description: "更新后的任务标题。",
  })),
  description: Type.Optional(Type.String({
    maxLength: MAX_DESCRIPTION_LENGTH,
    description: "更新后的任务说明。",
  })),
  activeForm: Type.Optional(Type.String({
    maxLength: MAX_ACTIVE_FORM_LENGTH,
    description: "更新后的当前工作短语。",
  })),
}, { additionalProperties: false });

type TaskStatus = Static<typeof taskStatusSchema>;

export interface TaskProgressItem {
  id: string;
  subject: string;
  status: TaskStatus;
  description?: string;
  activeForm?: string;
}

const ALLOWED_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  pending: new Set(["in_progress", "cancelled"]),
  in_progress: new Set(["completed", "blocked", "cancelled", "error"]),
  blocked: new Set(["in_progress", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
  error: new Set(["in_progress", "cancelled"]),
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKnownFields(value: unknown, fields: readonly string[], toolName: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`${toolName} 参数必须是对象`);
  const unknownField = Object.keys(value).find((key) => !fields.includes(key));
  if (unknownField) throw new Error(`${toolName} 不支持参数“${unknownField}”`);
  return value;
}

function readRequiredText(value: unknown, field: string, maxLength: number, toolName: string): string {
  if (typeof value !== "string") throw new Error(`${toolName} 的 ${field} 必须是文本`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${toolName} 的 ${field} 不能为空`);
  if (normalized.length > maxLength) throw new Error(`${toolName} 的 ${field} 不能超过 ${maxLength} 个字符`);
  return normalized;
}

function readOptionalText(value: unknown, field: string, maxLength: number, toolName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${toolName} 的 ${field} 必须是文本`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${toolName} 的 ${field} 不能超过 ${maxLength} 个字符`);
  return normalized || undefined;
}

function taskResult(task: TaskProgressItem) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ task }) }],
    // details 保留同一份结构化数据，现有工具活动展开视图可直接展示。
    details: { task },
  };
}

function validateTaskCreate(params: unknown): Omit<TaskProgressItem, "id" | "status"> {
  const input = assertKnownFields(params, ["subject", "description", "activeForm"], "TaskCreate");
  return {
    subject: readRequiredText(input.subject, "subject", MAX_SUBJECT_LENGTH, "TaskCreate"),
    description: readOptionalText(input.description, "description", MAX_DESCRIPTION_LENGTH, "TaskCreate"),
    activeForm: readOptionalText(input.activeForm, "activeForm", MAX_ACTIVE_FORM_LENGTH, "TaskCreate"),
  };
}

function validateTaskUpdate(params: unknown): {
  taskId: string;
  status?: TaskStatus;
  subject?: string;
  description?: string;
  activeForm?: string;
} {
  const input = assertKnownFields(
    params,
    ["taskId", "status", "subject", "description", "activeForm"],
    "TaskUpdate",
  );
  const taskId = readRequiredText(input.taskId, "taskId", 32, "TaskUpdate");
  if (!new RegExp(TASK_ID_PATTERN).test(taskId)) {
    throw new Error("TaskUpdate 的 taskId 格式无效");
  }

  if (input.status !== undefined && (typeof input.status !== "string" || !Object.hasOwn(ALLOWED_TRANSITIONS, input.status))) {
    throw new Error("TaskUpdate 的 status 无效");
  }
  if (Object.keys(input).length === 1) {
    throw new Error("TaskUpdate 至少需要更新 status、subject、description 或 activeForm 之一");
  }

  return {
    taskId,
    status: input.status as TaskStatus | undefined,
    subject: readOptionalText(input.subject, "subject", MAX_SUBJECT_LENGTH, "TaskUpdate"),
    description: readOptionalText(input.description, "description", MAX_DESCRIPTION_LENGTH, "TaskUpdate"),
    activeForm: readOptionalText(input.activeForm, "activeForm", MAX_ACTIVE_FORM_LENGTH, "TaskUpdate"),
  };
}

/**
 * 为一次 /pi-chat 请求创建进度工具。
 *
 * 调用方不得缓存返回值；新的工具数组意味着新的任务闭包和新的任务 ID 计数器。
 */
export function createTaskProgressTools() {
  const tasks = new Map<string, TaskProgressItem>();
  let nextTaskId = 1;

  return [
    {
      name: "TaskCreate",
      label: "创建任务进度",
      description: "创建一个当前请求内可见的任务进度项。仅用于多步骤、耗时或多阶段任务。",
      promptSnippet: "创建一个可见任务进度项。",
      parameters: taskCreateParams,
      execute: async (_toolCallId: string, params: Static<typeof taskCreateParams>) => {
        const input = validateTaskCreate(params);
        const task: TaskProgressItem = {
          id: String(nextTaskId++),
          subject: input.subject,
          status: "pending",
          ...(input.description ? { description: input.description } : {}),
          ...(input.activeForm ? { activeForm: input.activeForm } : {}),
        };
        tasks.set(task.id, task);
        return taskResult(task);
      },
    },
    {
      name: "TaskUpdate",
      label: "更新任务进度",
      description: "更新当前请求内已经创建的任务。使用 TaskCreate 返回的 taskId。",
      promptSnippet: "更新一个可见任务进度项。",
      parameters: taskUpdateParams,
      execute: async (_toolCallId: string, params: Static<typeof taskUpdateParams>) => {
        const input = validateTaskUpdate(params);
        const existing = tasks.get(input.taskId);
        if (!existing) throw new Error(`找不到任务 #${input.taskId}；请使用本次请求中 TaskCreate 返回的 taskId`);

        if (input.status && input.status !== existing.status && !ALLOWED_TRANSITIONS[existing.status].has(input.status)) {
          throw new Error(`任务 #${input.taskId} 不能从“${existing.status}”变更为“${input.status}”`);
        }

        const task: TaskProgressItem = {
          ...existing,
          ...(input.status ? { status: input.status } : {}),
          ...(input.subject ? { subject: input.subject } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.activeForm !== undefined ? { activeForm: input.activeForm } : {}),
        };
        tasks.set(task.id, task);
        return taskResult(task);
      },
    },
  ];
}
