import {
  initialize,
  MidiTrack,
  AudioTrack,
  DataModelObject,
  TakeLane,
  type ActivationContext,
  type ArrangementSelection,
} from "@ableton-extensions/sdk";
import type { DialogResult, Action } from "./schema.js";
import { buildSnapshot } from "./snapshot.js";
import { executeAction } from "./executor.js";
import { Session, type JsToolResult } from "./session.js";
import { SettingsStore } from "./settings.js";
import { ComponentStore } from "./component-store.js";
import { runJsTool } from "./js-runner.js";

import chatHTML from "./ui/chat.html";

export function activate(activation: ActivationContext): void {
  const api       = initialize(activation, "1.0.0");
  const session   = new Session(api.environment.storageDirectory);
  const settings  = new SettingsStore(api.environment.storageDirectory);
  const components = new ComponentStore(api.environment.storageDirectory);

  // ── Context menu ──────────────────────────────────────────────────────
  void api.ui.registerContextMenuAction("MidiTrack",  "Ask Q…", "q.chat");
  void api.ui.registerContextMenuAction("AudioTrack", "Ask Q…", "q.chat");
  void api.ui.registerContextMenuAction("MidiTrack.ArrangementSelection",  "Ask Q about selection…", "q.chatSelection");
  void api.ui.registerContextMenuAction("AudioTrack.ArrangementSelection", "Ask Q about selection…", "q.chatSelection");

  // ── Commands ──────────────────────────────────────────────────────────
  api.commands.registerCommand("q.chat", (_arg: unknown) => {
    void (async () => {
      const result = await openDialog(buildSnapshot(api.application.song));
      if (result) await applyResult(result);
    })();
  });

  api.commands.registerCommand("q.chatSelection", (arg: unknown) => {
    void (async () => {
      const sel = arg as ArrangementSelection;
      const song = api.application.song;
      const selectedTrackNames = sel.selected_lanes
        .map((h) => {
          try {
            const obj = api.getObjectFromHandle(h, DataModelObject);
            if (obj instanceof MidiTrack || obj instanceof AudioTrack) return obj.name;
            if (obj instanceof TakeLane) return obj.name;
            return null;
          } catch { return null; }
        })
        .filter((n): n is string => n !== null);
      const result = await openDialog(buildSnapshot(api.application.song, sel, selectedTrackNames));
      if (result) await applyResult(result);
    })();
  });

  api.commands.registerCommand("q.undoTurn",    () => { session.popHistory(); });
  api.commands.registerCommand("q.clearHistory", () => { session.clearHistory(); });

  // ── Helpers ───────────────────────────────────────────────────────────

  async function openDialog(snapshot: ReturnType<typeof buildSnapshot>): Promise<DialogResult | null> {
    const payload = {
      snapshot,
      history:      session.getHistory(),
      settings:     settings.get(),
      lastJsResult: session.getLastJsResult(),
      components:   components.list(),   // pass all saved components to the UI
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));
    const html    = chatHTML.replace("__PAYLOAD__", encoded);
    const url     = `data:text/html,${encodeURIComponent(html)}`;

    let raw: string;
    try {
      raw = await api.ui.showModalDialog(url, 760, 600);
    } catch (e) {
      console.error("[Q] Dialog error:", e);
      return null;
    }

    try {
      return JSON.parse(raw) as DialogResult;
    } catch { return null; }
  }

  async function applyResult(result: DialogResult): Promise<void> {
    if (result.settings) settings.set(result.settings);
    session.setHistory(result.history, result.settings?.activeModelId);

    // Handle component CRUD operations
    if (result.componentOp) {
      const op = result.componentOp;
      if (op.type === "save") {
        components.save({ name: op.name, description: op.description, code: op.code });
      } else if (op.type === "delete" && op.id) {
        components.delete(op.id);
      } else if (op.type === "update" && op.id) {
        components.update(op.id, { name: op.name, description: op.description, code: op.code });
      }
    }

    if (result.undo) { session.popHistory(); return; }
    if (!result.rawActions?.length) return;

    try {
      await api.ui.withinProgressDialog(
        `Applying ${result.rawActions.length} action${result.rawActions.length > 1 ? "s" : ""}…`,
        {},
        async () => {
          const promises = api.withinTransaction(() =>
            result.rawActions.map((a) => executeAction(api, a))
          );
          await Promise.all(promises);

          // Store JS result for next turn
          const jsAction = result.rawActions.find(a => a.type === "execute_js") as
            (Action & { _result?: JsToolResult }) | undefined;
          if (jsAction?._result) {
            session.setLastJsResult({
              ...jsAction._result,
              description: (jsAction as { description?: string }).description ?? "",
            });
          } else {
            session.setLastJsResult(null);
          }
        }
      );
    } catch (e) {
      console.error("[Q] Execution error:", e);
    }
  }
}
