import {
  type ExtensionContext,
  Song,
  Track,
  MidiTrack,
  AudioTrack,
  MidiClip,
  AudioClip,
  ClipSlot,
  Device,
  DeviceParameter,
  TakeLane,
  Scene,
  CuePoint,
  WarpMode,
  GridQuantization,
} from "@ableton-extensions/sdk";

export type JsRunResult = {
  ok: true;
  result: unknown;        // whatever the function returned
  logs: string[];         // anything written to the injected log()
} | {
  ok: false;
  error: string;
  logs: string[];
}

/**
 * Execute LLM-authored JS inside the extension host with full SDK access.
 *
 * The LLM writes a function body. We wrap it as:
 *
 *   async function qTool({ api, sdk, song, log }) { <body> }
 *
 * and call it immediately. The function receives:
 *   - api    — the full ExtensionContext (tracks, devices, withinTransaction, etc.)
 *   - sdk    — all SDK classes (MidiTrack, AudioClip, WarpMode, etc.)
 *   - song   — shorthand for api.application.song
 *   - log()  — captured console.log — returned to the LLM as context
 *
 * All execution is wrapped in api.withinTransaction() so the whole
 * operation is a single undo step in Live.
 *
 * Security model: this runs in the extension host (Node.js), not the
 * WebView. The LLM-authored code has the same privilege as the rest of
 * the extension — it can do anything the SDK exposes, nothing more.
 * This is intentional: the point is to give the LLM full SDK reach.
 */
export async function runJsTool(
  api: ExtensionContext<"1.0.0">,
  code: string
): Promise<JsRunResult> {
  const logs: string[] = [];
  const log = (...args: unknown[]) => {
    const line = args.map(a =>
      typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)
    ).join(" ");
    logs.push(line);
    console.log("[Q JS]", line);
  };

  // Expose the full SDK class surface so the LLM can use instanceof checks,
  // construct NoteDescription objects, reference WarpMode enums, etc.
  const sdk = {
    Song, Track, MidiTrack, AudioTrack,
    MidiClip, AudioClip, ClipSlot, Device, DeviceParameter,
    TakeLane, Scene, CuePoint, WarpMode, GridQuantization,
  };

  const song = api.application.song;

  let fn: (ctx: {
    api: typeof api;
    sdk: typeof sdk;
    song: typeof song;
    log: typeof log;
  }) => Promise<unknown>;

  // Wrap the code string in an async function
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function("{ api, sdk, song, log }", `return (async () => {\n${code}\n})();`) as typeof fn;
  } catch (e) {
    return { ok: false, error: `Syntax error: ${String(e)}`, logs };
  }

  // Run inside withinTransaction so the whole operation is one undo step
  try {
    const timeoutMs = 30000;
    const result = await Promise.race([
      api.withinTransaction(() => fn({ api, sdk, song, log })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`JS tool timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      ),
    ]);
    return { ok: true, result: result ?? null, logs };
  } catch (e) {
    return { ok: false, error: String(e), logs };
  }
}
