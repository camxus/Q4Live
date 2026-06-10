/**
 * Intent envelope — the ONLY output shape the LLM is allowed to emit.
 * The LLM is a parser, not a controller. It converts natural language
 * into one of these intents. The router decides what happens next.
 */

export interface NoteDesc {
  pitch: number;
  startTime: number;
  duration: number;
  velocity?: number;
  muted?: boolean;
  probability?: number;
  velocityDeviation?: number;
  releaseVelocity?: number;
}

// ── Resolved target ────────────────────────────────────────────────────────
// The LLM fills this from natural language. The router runs resolveTarget()
// to validate and fuzzy-match before any action fires.
export interface Target {
  trackName?: string;   // fuzzy — router resolves to exact
  clipIndex?: number;
  deviceName?: string;  // fuzzy — router resolves to exact
  arrClipIndex?: number;
}

// ── Static actions (executor.ts handles these) ─────────────────────────────
export type Action =
  | { type: "set_tempo";              bpm: number }
  | { type: "mute_track";             trackName: string; muted: boolean }
  | { type: "solo_track";             trackName: string; soloed: boolean }
  | { type: "arm_track";              trackName: string; armed: boolean }
  | { type: "rename_track";           trackName: string; newName: string }
  | { type: "rename_clip";            trackName: string; clipIndex: number; newName: string }
  | { type: "set_clip_color";         trackName: string; clipIndex: number; color: number }
  | { type: "set_clip_muted";         trackName: string; clipIndex: number; muted: boolean }
  | { type: "create_midi_track";      name?: string }
  | { type: "create_audio_track";     name?: string }
  | { type: "delete_track";           trackName: string }
  | { type: "duplicate_track";        trackName: string }
  | { type: "create_scene";           index: number; name?: string }
  | { type: "delete_scene";           sceneIndex: number }
  | { type: "create_midi_clip_slot";  trackName: string; slotIndex: number; lengthBeats: number }
  | { type: "create_midi_clip_arr";   trackName: string; startBeat: number; lengthBeats: number }
  | { type: "set_midi_notes";         trackName: string; clipIndex: number; notes: NoteDesc[] }
  | { type: "delete_clip";            trackName: string; clipIndex: number }
  | { type: "clear_clips_range";      trackName: string; startBeat: number; endBeat: number }
  | { type: "rename_clip_arr";        trackName: string; arrClipIndex: number; newName: string }
  | { type: "insert_device";          trackName: string; deviceName: string; index: number }
  | { type: "delete_device";          trackName: string; deviceName: string }
  | { type: "duplicate_device";       trackName: string; deviceName: string }
  | { type: "set_device_param";       trackName: string; deviceName: string; paramName: string; value: number }
  | { type: "create_cue_point";       timeBeat: number; name?: string }
  | { type: "delete_cue_point";       timeBeat: number }
  | { type: "execute_js";             code: string; description: string };

// ── Intent envelope ────────────────────────────────────────────────────────
export type IntentType =
  | "actions"       // emit Action[] — router executes them
  | "js"            // no static tool covers this — emit JS code
  | "clarify"       // ambiguous target — ask user
  | "unsupported"   // SDK limitation
  | "query";        // read-only question — no mutations

export interface Intent {
  intent: IntentType;

  // intent === "actions"
  actions?: Action[];

  // intent === "js"
  js?: { code: string; description: string };

  // intent === "clarify"
  clarify?: { question: string; candidates: string[] };

  // intent === "unsupported"
  unsupported?: { feature: string; reason: string };

  // intent === "query"
  answer?: string;
}

// ── Component operation ───────────────────────────────────────────────────
export interface ComponentOp {
  type: "save" | "update" | "delete";
  id?: string;
  name: string;
  description: string;
  code: string;
}

// ── Dialog message ─────────────────────────────────────────────────────────
export interface DialogResult {
  rawActions: Action[];
  history: Turn[];
  model: string;
  settings?: import("./settings.js").Settings;
  jsResult?: { ok: boolean; result: unknown; logs: string[]; description: string };
  componentOp?: ComponentOp;
  undo?: true;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}
