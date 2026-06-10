/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveTarget, route, SDK_LIMITATIONS } from "../src/router.js";
import type { Intent, SongSnap, TrackSnap, Action } from "../src/schema.js";

// ─── resolveTarget tests ───────────────────────────────────────────────────

describe("resolveTarget", () => {
  it("exact match returns score 1", () => {
    const r = resolveTarget("Kick", ["Kick", "Snare"]);
    expect(r).toEqual({ resolved: "Kick", score: 1 });
  });

  it("case-insensitive exact match", () => {
    const r = resolveTarget("kick", ["Kick", "Snare"]);
    expect(r).toEqual({ resolved: "Kick", score: 1 });
  });

  it("unresolved when no match", () => {
    const r = resolveTarget("Bass", ["Kick", "Snare"]);
    expect(r).toEqual({ unresolved: true });
  });

  it("substring match", () => {
    const r = resolveTarget("Bass", ["Sub Bass", "Lead Synth"]);
    expect(r.resolved).toBe("Sub Bass");
    expect(r.score).toBeGreaterThan(0);
  });

  it("ambiguous when two candidates score close", () => {
    const r = resolveTarget("ba", ["Bass", "Bass Guitar"]);
    expect(r.ambiguous).toBeDefined();
    expect(r.ambiguous!.length).toBeGreaterThan(0);
  });

  it("empty query returns unresolved", () => {
    const r = resolveTarget("", ["Kick"]);
    expect(r).toEqual({ unresolved: true });
  });
});

// ─── route tests ────────────────────────────────────────────────────────────

const mockSnap: SongSnap = {
  tempo: 128,
  scaleName: "Minor",
  rootNote: 9,
  scaleMode: true,
  tracks: [
    { name: "Kick", type: "audio", mute: false, solo: false, arm: false, devices: [], clipSlots: [], arrangementClips: [] },
    { name: "Bass", type: "midi", mute: false, solo: false, arm: false, devices: ["Wavetable"], clipSlots: [], arrangementClips: [] },
  ],
  scenes: [],
  cuePoints: [],
};

describe("route", () => {
  it("query intent returns answer", () => {
    const result = route({ intent: "query", answer: "128 BPM" }, mockSnap);
    expect(result).toEqual({ type: "answer", text: "128 BPM" });
  });

  it("unsupported intent returns unsupported", () => {
    const result = route({ intent: "unsupported", unsupported: { feature: "group_track", reason: "no API" } }, mockSnap);
    expect(result.type).toBe("unsupported");
  });

  it("js intent returns execute_js", () => {
    const result = route({ intent: "js", js: { code: "return 42;", description: "test" } }, mockSnap);
    expect(result).toEqual({ type: "execute_js", code: "return 42;", description: "test" });
  });

  it("js intent without code returns error", () => {
    const result = route({ intent: "js" }, mockSnap);
    expect(result.type).toBe("error");
  });

  it("actions intent resolves track names", () => {
    const actions: Action[] = [{ type: "mute_track", trackName: "kick", muted: true }];
    const result = route({ intent: "actions", actions }, mockSnap);
    if (result.type === "execute") {
      expect(result.actions[0]).toMatchObject({ type: "mute_track", trackName: "Kick", muted: true });
    } else {
      throw new Error(`Expected execute, got ${result.type}`);
    }
  });

  it("actions intent with unresolved track returns error", () => {
    const actions: Action[] = [{ type: "mute_track", trackName: "Drums", muted: true }];
    const result = route({ intent: "actions", actions }, mockSnap);
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("not found");
    }
  });

  it("actions with ambiguous track returns clarify", () => {
    const snap: SongSnap = {
      ...mockSnap,
      tracks: [
        { name: "Bass Guitar", type: "midi", mute: false, solo: false, arm: false, devices: [], clipSlots: [], arrangementClips: [] },
        { name: "Brass Synth", type: "midi", mute: false, solo: false, arm: false, devices: [], clipSlots: [], arrangementClips: [] },
      ],
    };
    const actions: Action[] = [{ type: "mute_track", trackName: "ass", muted: true }];
    const result = route({ intent: "actions", actions }, snap);
    expect(result.type).toBe("clarify");
  });

  it("unknown intent returns error", () => {
    const result = route({ intent: "invalid" as any }, mockSnap);
    expect(result.type).toBe("error");
  });
});

// ─── SDK_LIMITATIONS coverage ───────────────────────────────────────────────

describe("SDK_LIMITATIONS", () => {
  it("covers all documented limitations", () => {
    const expectedKeys = [
      "group_track", "move_track_group", "track_color", "third_party_plugin",
      "return_track", "send_routing", "transport", "clip_launch",
      "preset_load", "clip_move", "warp_markers",
    ];
    expectedKeys.forEach(k => {
      expect(SDK_LIMITATIONS[k]).toBeDefined();
      expect(typeof SDK_LIMITATIONS[k]).toBe("string");
    });
  });
});
