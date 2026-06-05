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
  DataModelObject,
} from "@ableton-extensions/sdk";
import type { Action } from "./schema.js";
import { runJsTool } from "./js-runner.js";

// ─── helpers ──────────────────────────────────────────────────────────────

function findTrack(song: Song<"1.0.0">, name: string): Track<"1.0.0"> {
  const t = song.tracks.find((t) => t.name === name);
  if (!t) throw new Error(`Track not found: "${name}"`);
  return t;
}

function findDevice(track: Track<"1.0.0">, name: string): Device<"1.0.0"> {
  const d = track.devices.find((d) => d.name === name);
  if (!d) throw new Error(`Device not found: "${name}" on track "${track.name}"`);
  return d;
}

// ─── main dispatcher ──────────────────────────────────────────────────────

/**
 * Executes a single Action against the Live data model.
 * Callers should wrap multiple calls inside api.withinTransaction().
 */
export async function executeAction(
  api: ExtensionContext<"1.0.0">,
  action: Action
): Promise<void> {
  const song = api.application.song;

  switch (action.type) {
    // ── Song-level ──────────────────────────────────────────────────────
    case "set_tempo":
      song.tempo = action.bpm;
      break;

    case "create_midi_track": {
      const t = await song.createMidiTrack();
      if (action.name) t.name = action.name;
      break;
    }

    case "create_audio_track": {
      const t = await song.createAudioTrack();
      if (action.name) t.name = action.name;
      break;
    }

    case "delete_track":
      await song.deleteTrack(findTrack(song, action.trackName));
      break;

    case "duplicate_track":
      await song.duplicateTrack(findTrack(song, action.trackName));
      break;

    case "create_scene": {
      const s = await song.createScene(action.index);
      if (action.name) s.name = action.name;
      break;
    }

    case "delete_scene": {
      const s = song.scenes[action.sceneIndex];
      if (!s) throw new Error(`Scene index ${action.sceneIndex} out of range`);
      await song.deleteScene(s);
      break;
    }

    case "create_cue_point": {
      const cp = await song.createCuePoint(action.timeBeat);
      if (action.name) cp.name = action.name;
      break;
    }

    case "delete_cue_point": {
      const cp = song.cuePoints.find((c) => c.time === action.timeBeat);
      if (!cp) throw new Error(`No cue point at beat ${action.timeBeat}`);
      await song.deleteCuePoint(cp);
      break;
    }

    // ── Track-level ─────────────────────────────────────────────────────
    case "mute_track":
      findTrack(song, action.trackName).mute = action.muted;
      break;

    case "solo_track":
      findTrack(song, action.trackName).solo = action.soloed;
      break;

    case "arm_track":
      findTrack(song, action.trackName).arm = action.armed;
      break;

    case "rename_track":
      findTrack(song, action.trackName).name = action.newName;
      break;

    case "clear_clips_range":
      await findTrack(song, action.trackName).clearClipsInRange(
        action.startBeat,
        action.endBeat
      );
      break;

    // ── Clip slot (session view) ─────────────────────────────────────────
    case "create_midi_clip_slot": {
      const slot = findTrack(song, action.trackName).clipSlots[action.slotIndex];
      if (!slot) throw new Error(`Slot index ${action.slotIndex} out of range`);
      await slot.createMidiClip(action.lengthBeats);
      break;
    }

    case "delete_clip": {
      const slot = findTrack(song, action.trackName).clipSlots[action.clipIndex];
      if (!slot) throw new Error(`Slot index ${action.clipIndex} out of range`);
      await slot.deleteClip();
      break;
    }

    case "rename_clip": {
      const slot = findTrack(song, action.trackName).clipSlots[action.clipIndex];
      if (slot?.clip) slot.clip.name = action.newName;
      break;
    }

    case "set_clip_color": {
      const slot = findTrack(song, action.trackName).clipSlots[action.clipIndex];
      if (slot?.clip) slot.clip.color = action.color;
      break;
    }

    case "set_clip_muted": {
      const slot = findTrack(song, action.trackName).clipSlots[action.clipIndex];
      if (slot?.clip) slot.clip.muted = action.muted;
      break;
    }

    case "set_midi_notes": {
      const slot = findTrack(song, action.trackName).clipSlots[action.clipIndex];
      if (!(slot?.clip instanceof MidiClip))
        throw new Error(`No MIDI clip at slot ${action.clipIndex} on "${action.trackName}"`);
      slot.clip.notes = action.notes;
      break;
    }

    // ── Arrangement clips ────────────────────────────────────────────────
    case "create_midi_clip_arr": {
      const track = findTrack(song, action.trackName);
      if (!(track instanceof MidiTrack))
        throw new Error(`Track "${action.trackName}" is not a MIDI track`);
      await track.createMidiClip(action.startBeat, action.lengthBeats);
      break;
    }

    case "rename_clip_arr": {
      const clips = findTrack(song, action.trackName).arrangementClips;
      const clip = clips[action.arrClipIndex];
      if (!clip) throw new Error(`Arrangement clip index ${action.arrClipIndex} out of range`);
      clip.name = action.newName;
      break;
    }

    // ── Devices ──────────────────────────────────────────────────────────
    case "insert_device":
      await findTrack(song, action.trackName).insertDevice(
        action.deviceName,
        action.index
      );
      break;

    case "delete_device":
      await findTrack(song, action.trackName).deleteDevice(
        findDevice(findTrack(song, action.trackName), action.deviceName)
      );
      break;

    case "duplicate_device": {
      const t = findTrack(song, action.trackName);
      await t.duplicateDevice(findDevice(t, action.deviceName));
      break;
    }

    case "set_device_param": {
      const t = findTrack(song, action.trackName);
      const d = findDevice(t, action.deviceName);
      const param = d.parameters.find((p) => p.name === action.paramName);
      if (!param)
        throw new Error(`Parameter "${action.paramName}" not found on device "${action.deviceName}"`);
      await param.setValue(action.value);
      break;
    }

    // ── Dynamic JS execution ────────────────────────────────────────────
    // The LLM writes a JS function body when it hits an SDK wall.
    // Runs with full SDK access inside withinTransaction().
    // Result is returned so the caller can feed it back into the next turn.

    case "execute_js": {
      const result = await runJsTool(api, action.code);
      if (!result.ok) {
        throw new Error(`JS tool failed: ${result.error}`);
      }
      // Attach result to the action so extension.ts can pass it back to the LLM
      (action as typeof action & { _result?: unknown })._result = {
        ok: result.ok,
        result: result.result,
        logs: result.logs,
      };
      break;
    }
  }
}
