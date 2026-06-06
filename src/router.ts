/**
 * router.ts — deterministic dispatch layer
 *
 * The LLM is a parser. This file is the controller.
 *
 * Flow:
 *   raw LLM output
 *     → parseIntent()        — extract Intent envelope from model response
 *     → resolveTargets()     — fuzzy-match track/device names to exact session names
 *     → checkCapabilities()  — static SDK capability lookup (no prompt needed)
 *     → RouteResult          — what the UI/host should do next
 */

import type { Action, Intent, Target } from "./schema.js";
import type { SongSnap } from "./snapshot.js";

// ── SDK capability map (static — never in the prompt) ─────────────────────

export const SDK_LIMITATIONS: Record<string, string> = {
  "group_track":       "createGroupTrack() does not exist in SDK v1.0.0",
  "move_track_group":  "No API to move a track into a group",
  "track_color":       "track.color is not exposed (clips only)",
  "third_party_plugin":"Only native Live devices — no VST/AU loading",
  "return_track":      "returnTracks is read-only, no createReturnTrack()",
  "send_routing":      "Send routing target is not writable",
  "transport":         "Transport (play/stop/record) not available in SDK v1.0.0",
  "clip_launch":       "Session-view clip launching not available",
  "preset_load":       "No API to load presets or samples by name",
  "clip_move":         "No clipSetStartTime — use execute_js to reposition clips",
  "warp_markers":      "warpMarkers is read-only — cannot be restored after clip moves",
};

// ── Fuzzy matcher ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchScore(query: string, candidate: string): number {
  const q = norm(query);
  const c = norm(candidate);
  if (!q || !c) return 0;
  if (c === q)          return 1;
  if (c.startsWith(q))  return 0.9;
  if (c.includes(q))    return 0.75;
  if (q.includes(c))    return 0.6;
  const qSet = new Set(q);
  const cSet = new Set(c);
  const overlap = [...qSet].filter(ch => cSet.has(ch)).length;
  return (overlap / Math.max(qSet.size, cSet.size)) * 0.5;
}

const MIN_SCORE       = 0.3;
const AMBIGUITY_GAP   = 0.15;

export interface ResolveResult {
  resolved?: string;
  ambiguous?: string[];
  unresolved?: true;
  score?: number;
}

export function resolveTarget(
  fuzzy: string,
  candidates: string[]
): ResolveResult {
  // Exact match fast path
  if (candidates.includes(fuzzy)) return { resolved: fuzzy, score: 1 };

  const scored = candidates
    .map(name => ({ name, score: matchScore(fuzzy, name) }))
    .filter(x => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { unresolved: true };

  const best   = scored[0]!;
  const second = scored[1];

  if (second && (best.score - second.score) < AMBIGUITY_GAP) {
    return { ambiguous: scored.slice(0, 4).map(x => x.name) };
  }

  return { resolved: best.name, score: best.score };
}

// ── Route result ───────────────────────────────────────────────────────────

export type RouteOutcome =
  | { type: "execute";     actions: Action[] }
  | { type: "execute_js";  code: string; description: string }
  | { type: "clarify";     question: string; candidates: string[]; pendingActions: Action[] }
  | { type: "unsupported"; feature: string; reason: string }
  | { type: "answer";      text: string }
  | { type: "error";       message: string };

// ── Main router ────────────────────────────────────────────────────────────

export function route(intent: Intent, snapshot: SongSnap): RouteOutcome {
  const trackNames  = snapshot.tracks.map(t => t.name);

  switch (intent.intent) {

    case "query":
      return { type: "answer", text: intent.answer ?? "" };

    case "unsupported": {
      const u = intent.unsupported;
      if (!u) return { type: "error", message: "unsupported intent missing payload" };
      return { type: "unsupported", feature: u.feature, reason: u.reason };
    }

    case "clarify": {
      const cl = intent.clarify;
      if (!cl) return { type: "error", message: "clarify intent missing payload" };
      return { type: "clarify", question: cl.question, candidates: cl.candidates, pendingActions: [] };
    }

    case "js": {
      const js = intent.js;
      if (!js?.code) return { type: "error", message: "js intent missing code" };
      // Check if a static action actually covers this before allowing JS
      return { type: "execute_js", code: js.code, description: js.description };
    }

    case "actions": {
      if (!intent.actions?.length) {
        return { type: "error", message: "actions intent has no actions" };
      }

      const resolved: Action[]  = [];
      const ambiguities: Array<{ question: string; candidates: string[]; action: Action }> = [];

      for (const action of intent.actions) {
        // Resolve trackName
        if ("trackName" in action && typeof action.trackName === "string") {
          const r = resolveTarget(action.trackName, trackNames);
          if (r.unresolved) {
            return {
              type: "error",
              message: `Track "${action.trackName}" not found in session`,
            };
          }
          if (r.ambiguous) {
            ambiguities.push({
              question: `Which track did you mean to ${action.type.replace(/_/g, " ")}?`,
              candidates: r.ambiguous,
              action,
            });
            continue;
          }
          // Patch in-place with resolved name
          (action as Record<string, unknown>)["trackName"] = r.resolved;
        }

        // Resolve deviceName (secondary target)
        if ("deviceName" in action && typeof action.deviceName === "string") {
          const track = snapshot.tracks.find(
            t => t.name === (action as Record<string, unknown>)["trackName"]
          );
          if (track) {
            const deviceNames = track.devices;
            const r = resolveTarget(action.deviceName, deviceNames);
            if (r.resolved) {
              (action as Record<string, unknown>)["deviceName"] = r.resolved;
            }
            // If device not found, let executor throw with a clear message
          }
        }

        resolved.push(action);
      }

      // If any ambiguities, return the first one — user must clarify before execution
      if (ambiguities.length) {
        return {
          type: "clarify",
          question:       ambiguities[0]!.question,
          candidates:     ambiguities[0]!.candidates,
          pendingActions: intent.actions,   // re-routed after clarification
        };
      }

      return { type: "execute", actions: resolved };
    }

    default:
      return { type: "error", message: `Unknown intent: ${String(intent.intent)}` };
  }
}
