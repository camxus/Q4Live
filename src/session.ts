import * as fs from "node:fs";
import * as path from "node:path";
import type { Turn } from "./schema.js";

const JOURNAL_FILE = "llm-journal.json";
const DEFAULT_MODEL = "claude-sonnet-4-5";

export interface JsToolResult {
  ok: boolean;
  result: unknown;
  logs: string[];
  description: string;   // the action.description so LLM knows what ran
}

interface JournalData {
  history: Turn[];
  model: string;
  lastJsResult?: JsToolResult;
}

/**
 * Persists the conversation history and selected model to
 * Environment.storageDirectory so they survive across Live sessions.
 */
export class Session {
  private journalPath: string | null;
  private history: Turn[] = [];
  private model: string = DEFAULT_MODEL;
  private lastJsResult: JsToolResult | null = null;

  constructor(storageDirectory: string | undefined) {
    this.journalPath = storageDirectory
      ? path.join(storageDirectory, JOURNAL_FILE)
      : null;
    this.load();
  }

  getHistory(): Turn[] {
    return this.history;
  }

  getModel(): string {
    return this.model;
  }

  getLastJsResult(): JsToolResult | null {
    return this.lastJsResult;
  }

  /** Replace the full history (and optionally update the selected model). */
  setHistory(turns: Turn[], model?: string): void {
    this.history = turns;
    if (model) this.model = model;
    this.save();
  }

  setLastJsResult(result: JsToolResult | null): void {
    this.lastJsResult = result;
    this.save();
  }

  /** Remove the last user+assistant pair — used by the Undo Turn command. */
  popHistory(): void {
    if (this.history.length >= 2) {
      this.history.splice(-2, 2);
      this.save();
    }
  }

  clearHistory(): void {
    this.history = [];
    this.save();
  }

  // ─── persistence ────────────────────────────────────────────────────────

  private save(): void {
    if (!this.journalPath) return;
    try {
      const data = { history: this.history, model: this.model, lastJsResult: this.lastJsResult ?? undefined };
      fs.writeFileSync(this.journalPath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      console.error("[Q] Failed to save journal:", e);
    }
  }

  private load(): void {
    if (!this.journalPath || !fs.existsSync(this.journalPath)) return;
    try {
      const raw = fs.readFileSync(this.journalPath, "utf8");
      const data = JSON.parse(raw) as JournalData;
      this.history = data.history ?? [];
      this.model = data.model ?? DEFAULT_MODEL;
      this.lastJsResult = data.lastJsResult ?? null;
    } catch {
      // Corrupt journal — start fresh
      this.history = [];
    }
  }
}
