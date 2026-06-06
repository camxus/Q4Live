import {
  initialize,
  MidiTrack,
  AudioTrack,
  DataModelObject,
  TakeLane,
  type ActivationContext,
  type ArrangementSelection,
} from "@ableton-extensions/sdk";
import type { DialogResult } from "./schema.js";
import { buildSnapshot } from "./snapshot.js";
import { executeAction } from "./executor.js";
import { Session, type JsToolResult } from "./session.js";
import { SettingsStore } from "./settings.js";

import chatHTML from "./ui/chat.html";

export function activate(activation: ActivationContext): void {
  const api      = initialize(activation, "1.0.0");
  const session  = new Session(api.environment.storageDirectory);
  const settings = new SettingsStore(api.environment.storageDirectory);

  // ── Context menu entry points ──────────────────────────────────────────

  void api.ui.registerContextMenuAction("MidiTrack",  "Ask Q…", "llm.chat");
  void api.ui.registerContextMenuAction("AudioTrack", "Ask Q…", "llm.chat");
  void api.ui.registerContextMenuAction("MidiTrack.ArrangementSelection",  "Ask Q about selection…", "llm.chatSelection");
  void api.ui.registerContextMenuAction("AudioTrack.ArrangementSelection", "Ask Q about selection…", "llm.chatSelection");

  // ── Commands ───────────────────────────────────────────────────────────

  api.commands.registerCommand("llm.chat", (_arg: unknown) => {
    void (async () => {
      const result = await openDialog(buildSnapshot(api.application.song));
      if (result) await applyResult(result);
    })();
  });

  api.commands.registerCommand("llm.chatSelection", (arg: unknown) => {
    void (async () => {
      const sel = arg as ArrangementSelection;
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

  api.commands.registerCommand("llm.undoTurn",    () => { session.popHistory(); });
  api.commands.registerCommand("llm.clearHistory", () => { session.clearHistory(); });

  // ── Helpers ────────────────────────────────────────────────────────────

  async function openDialog(
    snapshot: ReturnType<typeof buildSnapshot>
  ): Promise<DialogResult | null> {
    const payload = {
      snapshot,
      history:      session.getHistory(),
      settings:     settings.get(),
      lastJsResult: session.getLastJsResult(),  // fed back into system prompt
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));
    const html    = chatHTML.replace("__PAYLOAD__", encoded);
    const url     = `data:text/html,${encodeURIComponent(html)}`;

    let raw: string;
    try {
      raw = await api.ui.showModalDialog(url, 720, 580);
    } catch (e) {
      console.error("[Q] Dialog error:", e);
      return null;
    }

    try {
      return JSON.parse(raw) as DialogResult;
    } catch { return null; }
  }

  async function applyResult(result: DialogResult): Promise<void> {
    // Persist updated settings if the user changed them in the dialog
    if (result.settings) {
      settings.set(result.settings);
    }

    session.setHistory(result.history, result.settings?.activeModelId);

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

          // If any action was execute_js, store its result so the next
          // dialog open can feed it back into the LLM as context
          const jsAction = result.rawActions.find(a => a.type === "execute_js") as
            (typeof result.rawActions[0] & { _result?: JsToolResult }) | undefined;
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
