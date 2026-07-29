import { describe, expect, it } from "vitest";
import { createTaskProgressTools } from "../task-progress-tools.js";

type TaskTool = {
  name: string;
  execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: { task: { id: string; subject: string; status: string; activeForm?: string } };
  }>;
};

function toolsForRequest() {
  const tools = createTaskProgressTools() as unknown as TaskTool[];
  return {
    create: tools.find((tool) => tool.name === "TaskCreate")!,
    update: tools.find((tool) => tool.name === "TaskUpdate")!,
  };
}

describe("Given 当前 Agent 请求使用可见任务工具", () => {
  it("When 创建并推进任务 Then 返回可被工具活动管道直接展示的结构化结果", async () => {
    const { create, update } = toolsForRequest();
    const created = await create.execute("call-create", {
      subject: "核对实验数据",
      activeForm: "正在核对实验数据",
    });

    expect(created.details.task).toMatchObject({ id: "1", subject: "核对实验数据", status: "pending" });
    expect(JSON.parse(created.content[0].text)).toEqual({ task: created.details.task });

    const updated = await update.execute("call-update", {
      taskId: "1",
      status: "in_progress",
      activeForm: "正在比对异常值",
    });
    expect(updated.details.task).toMatchObject({
      id: "1",
      status: "in_progress",
      activeForm: "正在比对异常值",
    });
  });

  it("Given 两次不同请求 When 都创建首项任务 Then 任务状态不会跨请求共享", async () => {
    const first = toolsForRequest();
    const second = toolsForRequest();
    await first.create.execute("call-1", { subject: "第一轮任务" });

    await expect(second.update.execute("call-2", { taskId: "1", status: "in_progress" }))
      .rejects.toThrow("找不到任务 #1");
    await expect(second.create.execute("call-3", { subject: "第二轮任务" }))
      .resolves.toMatchObject({ details: { task: { id: "1", status: "pending" } } });
  });

  it("Given 已创建任务 When 传入未知字段、未知 ID 或非法状态迁移 Then 返回中文校验错误", async () => {
    const { create, update } = toolsForRequest();
    await expect(create.execute("call-invalid", { subject: "任务", arbitrary: true }))
      .rejects.toThrow("TaskCreate 不支持参数“arbitrary”");

    await create.execute("call-create", { subject: "任务" });
    await expect(update.execute("call-missing", { taskId: "99", status: "in_progress" }))
      .rejects.toThrow("找不到任务 #99");
    await expect(update.execute("call-status", { taskId: "1", status: "paused" }))
      .rejects.toThrow("TaskUpdate 的 status 无效");
    await expect(update.execute("call-finish", { taskId: "1", status: "in_progress" }))
      .resolves.toMatchObject({ details: { task: { status: "in_progress" } } });
    await expect(update.execute("call-complete", { taskId: "1", status: "completed" }))
      .resolves.toMatchObject({ details: { task: { status: "completed" } } });
    await expect(update.execute("call-reopen", { taskId: "1", status: "in_progress" }))
      .rejects.toThrow("不能从“completed”变更为“in_progress”");
  });
});
