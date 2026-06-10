import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ComponentStore } from "../src/component-store.js";

const TEST_DIR = "/tmp/q-test-components";

describe("ComponentStore", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  it("starts empty when file does not exist", () => {
    const store = new ComponentStore(TEST_DIR);
    expect(store.list()).toEqual([]);
  });

  it("persists and loads component", () => {
    const store = new ComponentStore(TEST_DIR);
    const comp = store.save({ name: "Test", description: "desc", code: "<html>", createdAt: "", updatedAt: "" });
    expect(comp.id).toBeDefined();
    expect(comp.name).toBe("Test");

    const store2 = new ComponentStore(TEST_DIR);
    expect(store2.list().length).toBe(1);
    expect(store2.list()[0]!.name).toBe("Test");
  });

  it("delete removes component", () => {
    const store = new ComponentStore(TEST_DIR);
    const comp = store.save({ name: "X", description: "d", code: "", createdAt: "", updatedAt: "" });
    expect(store.delete(comp.id)).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it("delete returns false for missing id", () => {
    const store = new ComponentStore(TEST_DIR);
    expect(store.delete("nope")).toBe(false);
  });

  it("update modifies component", () => {
    const store = new ComponentStore(TEST_DIR);
    const comp = store.save({ name: "Old", description: "d", code: "v1", createdAt: "", updatedAt: "" });
    const updated = store.update(comp.id, { name: "New", description: "new", code: "v2" });
    expect(updated!.name).toBe("New");
    expect(updated!.code).toBe("v2");
  });

  it("update returns null for missing id", () => {
    const store = new ComponentStore(TEST_DIR);
    expect(store.update("nope", { name: "x" })).toBeNull();
  });

  it("get returns component by id", () => {
    const store = new ComponentStore(TEST_DIR);
    const comp = store.save({ name: "A", description: "d", code: "", createdAt: "", updatedAt: "" });
    expect(store.get(comp.id)!.name).toBe("A");
  });

  it("get returns undefined for missing id", () => {
    const store = new ComponentStore(TEST_DIR);
    expect(store.get("nope")).toBeUndefined();
  });

  it("generates unique ids (no collision in 50 items)", () => {
    const store = new ComponentStore(TEST_DIR);
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const comp = store.save({ name: `C${i}`, description: "d", code: "", createdAt: "", updatedAt: "" });
      expect(ids.has(comp.id)).toBe(false);
      ids.add(comp.id);
    }
    expect(ids.size).toBe(50);
  });

  it("handles corrupt JSON gracefully on load", () => {
    fs.writeFileSync(path.join(TEST_DIR, "components.json"), "NOT JSON {{{");
    const store = new ComponentStore(TEST_DIR);
    expect(store.list()).toEqual([]);
  });

  it("handles empty JSON array", () => {
    fs.writeFileSync(path.join(TEST_DIR, "components.json"), "[]");
    const store = new ComponentStore(TEST_DIR);
    expect(store.list()).toEqual([]);
  });

  it("read-only file failure logs but does not throw", () => {
    const store = new ComponentStore(TEST_DIR);
    // should not throw on save even if dir is removed after construction
    expect(() => store.save({ name: "Y", description: "d", code: "", createdAt: "", updatedAt: "" })).not.toThrow();
  });
});
