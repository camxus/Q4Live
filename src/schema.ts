/**
 * Every action the LLM can emit.
 * The chat.html serializes these as JSON; executor.ts deserializes and dispatches them.
 * All actions are executed inside withinTransaction() for a single Live undo step.
 */

export interface NoteDesc {
  pitch: number;       // 0-127 MIDI note
  startTime: number;   // position in beats from clip start
  duration: number;    // length in beats
  velocity?: number;   // 0-127, default 100
  muted?: boolean;
  probability?: number;       // 0-1
  velocityDeviation?: number; // -127 to 127
  releaseVelocity?: number;   // 0-127
}

export type Action =
  | { type: "set_tempo";           bpm: number }
  | { type: "mute_track";          trackName: string; muted: boolean }
  | { type: "solo_track";          trackName: string; soloed: boolean }
  | { type: "arm_track";           trackName: string; armed: boolean }
  | { type: "rename_track";        trackName: string; newName: string }
  | { type: "rename_clip";         trackName: string; clipIndex: number; newName: string }
  | { type: "set_clip_color";      trackName: string; clipIndex: number; color: number }
  | { type: "set_clip_muted";      trackName: string; clipIndex: number; muted: boolean }
  | { type: "create_midi_track";   name?: string }
  | { type: "create_audio_track";  name?: string }
  | { type: "delete_track";        trackName: string }
  | { type: "duplicate_track";     trackName: string }
  | { type: "create_scene";        index: number; name?: string }
  | { type: "delete_scene";        sceneIndex: number }
  | { type: "create_midi_clip_slot";  trackName: string; slotIndex: number; lengthBeats: number }
  | { type: "create_midi_clip_arr";   trackName: string; startBeat: number; lengthBeats: number }
  | { type: "set_midi_notes";         trackName: string; clipIndex: number; notes: NoteDesc[] }
  | { type: "delete_clip";            trackName: string; clipIndex: number }
  | { type: "clear_clips_range";      trackName: string; startBeat: number; endBeat: number }
  | { type: "rename_clip_arr";        trackName: string; arrClipIndex: number; newName: string }
  | { type: "insert_device";       trackName: string; deviceName: string; index: number }
  | { type: "delete_device";       trackName: string; deviceName: string }
  | { type: "duplicate_device";    trackName: string; deviceName: string }
  | { type: "set_device_param";    trackName: string; deviceName: string; paramName: string; value: number }
  | { type: "create_cue_point";   timeBeat: number; name?: string }
  | { type: "delete_cue_point";   timeBeat: number }

  // ── Dynamic JS execution ──────────────────────────────────────────────
  // Used when the LLM encounters an operation not covered by static tools.
  // The LLM writes a JS function body; the harness runs it with full SDK access.
  | { type: "execute_js"; code: string; description: string };

// ─── message exchanged via close_and_send ─────────────────────────────────
export interface DialogResult {
  actions: Action[];
  history: Turn[];
  model: string;        // kept for backward compat; canonical model is in settings
  settings?: import("./settings.js").Settings;
  undo?: true;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}
