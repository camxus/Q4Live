import {
  Song,
  Track,
  MidiTrack,
  AudioTrack,
  MidiClip,
  AudioClip,
  type ArrangementSelection,
} from "@ableton-extensions/sdk";

export interface TrackSnap {
  name: string;
  type: "midi" | "audio";
  mute: boolean;
  solo: boolean;
  arm: boolean;
  devices: string[];
  // Session view clip slots (index = slot index, null = empty)
  clipSlots: (string | null)[];
  // Arrangement clips (index = clip index)
  arrangementClips: { name: string; startBeat: number; endBeat: number }[];
}

export interface SongSnap {
  tempo: number;
  scaleName: string;
  rootNote: number;
  scaleMode: boolean;
  tracks: TrackSnap[];
  scenes: { name: string; tempo: number; timeSig: string }[];
  cuePoints: { name: string; timeBeat: number }[];
  selectionCtx?: {
    startBeat: number;
    endBeat: number;
    selectedTrackNames: string[];
  };
}

export function buildSnapshot(
  song: Song<"1.0.0">,
  sel?: ArrangementSelection,
  selectedTrackNames?: string[]
): SongSnap {
  const tracks = song.tracks.map((t) => {
    const type: "midi" | "audio" =
      t instanceof MidiTrack ? "midi" : "audio";

    const clipSlots = t.clipSlots.map((s) => s.clip?.name ?? null);

    const arrangementClips = t.arrangementClips.map((c) => ({
      name: c.name,
      startBeat: c.startTime,
      endBeat: c.endTime,
    }));

    const devices = t.devices.map((d) => d.name);

    return {
      name: t.name,
      type,
      mute: t.mute,
      solo: t.solo,
      arm: t.arm,
      devices,
      clipSlots,
      arrangementClips,
    } satisfies TrackSnap;
  });

  const scenes = song.scenes.map((s) => ({
    name: s.name,
    tempo: s.tempo,
    timeSig: `${s.signatureNumerator}/${s.signatureDenominator}`,
  }));

  const cuePoints = song.cuePoints.map((cp) => ({
    name: cp.name,
    timeBeat: cp.time,
  }));

  const snap: SongSnap = {
    tempo: song.tempo,
    scaleName: song.scaleName,
    rootNote: song.rootNote,
    scaleMode: song.scaleMode,
    tracks,
    scenes,
    cuePoints,
  };

  if (sel) {
    snap.selectionCtx = {
      startBeat: sel.time_selection_start,
      endBeat: sel.time_selection_end,
      selectedTrackNames: selectedTrackNames ?? [],
    };
  }

  return snap;
}
