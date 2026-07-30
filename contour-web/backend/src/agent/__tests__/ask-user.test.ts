import { describe, expect, it } from "vitest";
import { AskUserRequestManager } from "../ask-user.js";

describe("AskUserRequestManager", () => {
  it("Given 两个并发运行时, When 分别提问并回答, Then 事件和答案不会串到另一个运行时", async () => {
    const firstEvents: Array<{ requestId: string }> = [];
    const secondEvents: Array<{ requestId: string }> = [];
    const first = new AskUserRequestManager();
    const second = new AskUserRequestManager();
    first.beginPrompt((event) => firstEvents.push(event as { requestId: string }));
    second.beginPrompt((event) => secondEvents.push(event as { requestId: string }));

    const firstAnswer = first.request([{ header: "first", question: "第一个问题" }]);
    const secondAnswer = second.request([{ header: "second", question: "第二个问题" }]);
    const firstRequestId = firstEvents[0]?.requestId;
    const secondRequestId = secondEvents[0]?.requestId;

    expect(firstEvents).toHaveLength(1);
    expect(secondEvents).toHaveLength(1);
    expect(firstRequestId).not.toBe(secondRequestId);
    expect(second.resolve(firstRequestId!, { first: "错误会话" })).toBe(false);

    expect(first.resolve(firstRequestId!, { first: "第一个答案" })).toBe(true);
    expect(second.resolve(secondRequestId!, { second: "第二个答案" })).toBe(true);
    await expect(firstAnswer).resolves.toEqual({ answers: { first: "第一个答案" } });
    await expect(secondAnswer).resolves.toEqual({ answers: { second: "第二个答案" } });
  });

  it("Given 两个并发 AskUser 请求, When 清理其中一个管理器, Then 另一个请求仍可回答", async () => {
    const firstEvents: Array<{ requestId: string }> = [];
    const secondEvents: Array<{ requestId: string }> = [];
    const first = new AskUserRequestManager();
    const second = new AskUserRequestManager();
    const firstGeneration = first.beginPrompt((event) => firstEvents.push(event as { requestId: string }));
    second.beginPrompt((event) => secondEvents.push(event as { requestId: string }));

    const firstAnswer = first.request([{ header: "first", question: "第一个问题" }]);
    const secondAnswer = second.request([{ header: "second", question: "第二个问题" }]);
    first.endPrompt(firstGeneration, "第一个会话已关闭");

    await expect(firstAnswer).rejects.toThrow("第一个会话已关闭");
    expect(second.resolve(secondEvents[0]!.requestId, { second: "仍可回答" })).toBe(true);
    await expect(secondAnswer).resolves.toEqual({ answers: { second: "仍可回答" } });
  });

  it("Given 新 generation 已开始, When 旧 generation 延迟结束, Then 新请求和 SSE 通道保持可用", async () => {
    const events: Array<{ requestId: string; questions: Array<{ header: string }> }> = [];
    const manager = new AskUserRequestManager();
    const oldGeneration = manager.beginPrompt((event) => events.push(event as typeof events[number]));
    const newGeneration = manager.beginPrompt((event) => events.push(event as typeof events[number]));

    const answer = manager.request([{ header: "new", question: "新问题" }]);
    const requestId = events[0]!.requestId;
    manager.endPrompt(oldGeneration, "旧轮次收尾");

    expect(manager.resolve(requestId, { new: "新答案" })).toBe(true);
    await expect(answer).resolves.toEqual({ answers: { new: "新答案" } });
    expect(events).toHaveLength(1);
    expect(newGeneration).not.toBe(oldGeneration);
  });
});
