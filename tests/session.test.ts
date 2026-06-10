/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Session } from "../src/session.js";

const TEST_DIR = "/tmp/q-test-session";

describe("Session", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  it("starts with default model", () => {
    const session = new Session(TEST_DIR);
    expect(session.getModel()).toBe("claude-sonnet-4-5");
  });

  it("setHistory replaces history and model", () => {
    const session = new Session(TEST_DIR);
    session.setHistory([{ role: "user", content: "hello" }], "gpt-4o");
    expect(session.getHistory().length).toBe(1);
    expect(session.getModel()).toBe("gpt-4o");
  });

  it("popHistory removes last pair", () => {
    const session = new Session(TEST_DIR);
    session.setHistory([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
    expect(session.getHistory().length).toBe(4);
    session.popHistory();
    expect(session.getHistory().length).toBe(2);
    expect(session.getHistory()[0]!.content).toBe("q1");
  });

  it("popHistory is no-op with 1 or 0 turns (edge case)", () => {
    const session = new Session(TEST_DIR);
    expect(() => session.popHistory()).not.toThrow();
    expect(session.getHistory()).toEqual([]);

    session.setHistory([{ role: "user", content: "only" }]);
    session.popHistory();
    expect(session.getHistory().length).toBe(1);
  });

  it("clearHistory removes all turns", () => {
    const session = new Session(TEST_DIR);
    session.setHistory([
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]);
    session.clearHistory();
    expect(session.getHistory()).toEqual([]);
  });

  it("setLastJsResult persists and loads", () => {
    const s1 = new Session(TEST_DIR);
    s1.setLastJsResult({ ok: true, result: "data", logs: ["log"], description: "desc" });
    const s2 = new Session(TEST_DIR);
    expect(s2.getLastJsResult()!.ok).toBe(true);
    expect(s2.getLastJsResult()!.result).toBe("data");
  });

  it("setLastJsResult(null) clears", () => {
    const session = new Session(TEST_DIR);
    session.setLastJsResult({ ok: true, result: 1, logs: [], description: "x" });
    session.setLastJsResult(null);
    expect(session.getLastJsResult()).toBeNull();
  });

  it("handles corrupt journal file gracefully", () => {
    fs.writeFileSync(path.join(TEST_DIR, "llm-journal.json"), "CORRUPT{{");
    const session = new Session(TEST_DIR);
    expect(session.getHistory()).toEqual([]);
    expect(session.getModel()).toBe("claude-sonnet-4-5");
  });

  it("setHistory with undefined model keeps current", () => {
    const session = new Session(TEST_DIR);
    session.setHistory([{ role: "user", content: "q" }], "gpt-4o");
    session.setHistory([{ role: "user", content: "q2" }]);
    expect(session.getModel()).toBe("gpt-4o");
  });
});
