import {
  type ExtensionContext,
  MidiTrack,
  AudioTrack,
  MidiClip,
  AudioClip,
  Track,
  Song,
} from "@ableton-extensions/sdk";

// ─── Types ────────────────────────────────────────────────────────────────

interface ClipSnapshot {
  kind: "midi" | "audio";
  // Position
  startTime: number;
  duration: number;
  // Shared clip properties
  name: string;
  color: number;
  muted: boolean;
  looping: boolean;
  loopStart: number;
  loopEnd: number;
  startMarker: number;
  endMarker: number;
  // MIDI only
  notes?: import("@ableton-extensions/sdk").NoteDescription[];
  // Audio only
  filePath?: string;
  warping?: boolean;
  warpMode?: import("@ableton-extensions/sdk").WarpMode;
  // warpMarkers are read-only on AudioClip — cannot be restored
}

export interface ConsolidateResult {
  trackName: string;
  clipsProcessed: number;
  skipped: { reason: string }[];
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────

function snapshotClip(clip: MidiClip<"1.0.0"> | AudioClip<"1.0.0">): ClipSnapshot {
  const base = {
    startTime:   clip.startTime,
    duration:    clip.duration,
    name:        clip.name,
    color:       clip.color,
    muted:       clip.muted,
    looping:     clip.looping,
    loopStart:   clip.loopStart,
    loopEnd:     clip.loopEnd,
    startMarker: clip.startMarker,
    endMarker:   clip.endMarker,
  };

  if (clip instanceof MidiClip) {
    return { kind: "midi", ...base, notes: clip.notes };
  } else {
    return {
      kind:     "audio",
      ...base,
      filePath: clip.filePath,
      warping:  clip.warping,
      warpMode: clip.warpMode,
      // warpMarkers not captured — read-only, cannot be restored
    };
  }
}

// ─── Recreate a clip at a new startTime ───────────────────────────────────

async function recreateClip(
  track: MidiTrack<"1.0.0"> | AudioTrack<"1.0.0">,
  snap: ClipSnapshot,
  newStartTime: number
): Promise<void> {
  let newClip: MidiClip<"1.0.0"> | AudioClip<"1.0.0">;

  if (snap.kind === "midi") {
    if (!(track instanceof MidiTrack)) throw new Error("MIDI clip on non-MIDI track");
    newClip = await track.createMidiClip(newStartTime, snap.duration);
    newClip.notes = snap.notes ?? [];
  } else {
    if (!(track instanceof AudioTrack)) throw new Error("Audio clip on non-audio track");
    if (!snap.filePath) throw new Error("Audio clip has no file path");
    newClip = await track.createAudioClip({
      filePath: snap.filePath,
      startTime: newStartTime,
      duration: snap.duration,
      ...(snap.warping !== undefined && {
        isWarped: snap.warping,
      }),
      ...(snap.looping && {
        loopSettings: {
          looping: true,
          startMarker: snap.startMarker,
          endMarker: snap.endMarker,
          loopStart: snap.loopStart,
          loopEnd: snap.loopEnd,
        },
      }),
    });
    if (snap.warping !== undefined) newClip.warping  = snap.warping;
    if (snap.warpMode !== undefined) newClip.warpMode = snap.warpMode;
    // Note: warpMarkers cannot be restored (read-only in SDK v1.0.0)
  }

  // Restore shared properties
  newClip.name    = snap.name;
  newClip.color   = snap.color;
  newClip.muted   = snap.muted;
  newClip.looping = snap.looping;
  // if (snap.looping) {
  //   newClip.loopStart = snap.loopStart;
  //   newClip.loopEnd   = snap.loopEnd;
  // }
}

// ─── Consolidate a single track ───────────────────────────────────────────

/**
 * Reads all arrangement clips on a track, sorts them by startTime,
 * then rebuilds them packed left-to-right with no gaps.
 *
 * Runs entirely inside the caller's withinTransaction() so the whole
 * operation is one undo step in Live.
 */
export async function consolidateTrackGaps(
  track: Track<"1.0.0">
): Promise<ConsolidateResult> {
  const result: ConsolidateResult = {
    trackName:       track.name,
    clipsProcessed:  0,
    skipped:         [],
  };

  const clips = track.arrangementClips;
  if (clips.length === 0) return result;

  // Sort by position
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);

  // Snapshot all clips before deleting anything
  const snapshots: ClipSnapshot[] = [];
  for (const clip of sorted) {
    if (!(clip instanceof MidiClip) && !(clip instanceof AudioClip)) {
      result.skipped.push({ reason: `Clip "${clip.name}" is an unknown type — skipped` });
      continue;
    }
    // Audio clip guard: filePath must be readable
    if (clip instanceof AudioClip && !clip.filePath) {
      result.skipped.push({ reason: `Audio clip "${clip.name}" has no readable file path — skipped` });
      continue;
    }
    snapshots.push(snapshotClip(clip));
  }

  if (snapshots.length === 0) return result;

  // Check if already consolidated — no gaps
  let alreadyPacked = true;
  let cursor = snapshots[0]!.startTime;
  for (const snap of snapshots) {
    if (Math.abs(snap.startTime - cursor) > 0.001) { alreadyPacked = false; break; }
    cursor += snap.duration;
  }
  if (alreadyPacked) {
    result.skipped.push({ reason: "No gaps found — track already consolidated" });
    return result;
  }

  // Delete all original clips in the range
  const rangeStart = snapshots[0]!.startTime;
  const rangeEnd   = snapshots[snapshots.length - 1]!.startTime +
                     snapshots[snapshots.length - 1]!.duration;
  await track.clearClipsInRange(rangeStart, rangeEnd);

  // Recreate clips packed from the position of the first original clip
  let head = rangeStart;
  for (const snap of snapshots) {
    await recreateClip(
      track as MidiTrack<"1.0.0"> | AudioTrack<"1.0.0">,
      snap,
      head
    );
    head += snap.duration;
    result.clipsProcessed++;
  }

  return result;
}

// ─── Consolidate all tracks ───────────────────────────────────────────────

export async function consolidateAllTrackGaps(
  song: Song<"1.0.0">
): Promise<ConsolidateResult[]> {
  const results: ConsolidateResult[] = [];
  for (const track of song.tracks) {
    if (!(track instanceof MidiTrack) && !(track instanceof AudioTrack)) continue;
    const r = await consolidateTrackGaps(track);
    results.push(r);
  }
  return results;
}
