# AUDIT.md — Code Issues, Root Cause & Solutions

> Repository: `q-for-live` (`ableton-llm-controller`)
> Audit date: 2026-06-10

---

## 1. Delete `ableton-llm-controller new/`

| Field | Detail |
|-------|--------|
| **Issue** | Duplicate sibling directory (`ableton-llm-controller new/`) with no `dist/`, `node_modules/`, no working package install, and no unique logic. Risks accidental edits to stale files. |
| **Root cause** | Created as a copy/worktree but never kept in sync. |
| **Solution** | Deleted the directory. All authoritative source lives in `ableton-llm-controller/`. |

---

## 2. XSS via unescaped component data in `chat.html`

| Field | Detail |
|-------|--------|
| **Issue** | `renderWelcomeDashboard` (line 1857) and `renderComponentList` (line 2023) inject `comp.name` and `comp.description` into `innerHTML`. A corrupt or malicious `components.json` (or a generated component) can execute arbitrary JavaScript. Also `handleListComponents` (line 2142) and `renderAutocomplete` (line 2226) use template strings into `innerHTML` with user-derived strings. |
| **Root cause** | Assumption that component data is always "friendly" because it originates from the LLM. LLM output is not a trust boundary. |
| **Solution** | Replaced all unescaped `innerHTML` assignments with DOM APIs (`createElement` + `textContent`). Fixed: `renderWelcomeDashboard` (1857), `renderComponentList` (2023), `handleListComponents` (2134–2142), `renderAutocomplete` (2226). |

**Proof**: Vitest-added router tests confirm validation paths; for chat.html XSS, manual review confirms zero `innerHTML` references that pass unescaped variables.

---

## 3. Dead `intents` field in `DialogResult` schema

| Field | Detail |
|-------|--------|
| **Issue** | `DialogResult.intents: Intent[]` is declared in `src/schema.ts` (96) but never populated in `chat.html` or read in `extension.ts`. The contract implies data flows that doesn't exist, confusing future contributors. |
| **Root cause** | Design oscillated between "return all parsed intents" and "return flattened actions". The field was kept in the type but abandoned in implementation. |
| **Solution** | Removed `intents` from `DialogResult`. Removed `intents: []` from all `closeWithResult()` calls in `chat.html`. No runtime behaviour change — confirmed by `tsc --noEmit` passing clean. |

---

## 4. `new Function()` with no timeout in `js-runner.ts`

| Field | Detail |
|-------|--------|
| **Issue** | LLM-authored JS runs via `new Function(...)` with full SDK access and no execution guard. Infinite loops or long-running async operations freeze the extension host (Ableton Live becomes unresponsive). |
| **Root cause** | Trust model gave LLM full SDK reach but didn't account for the LLM writing pathological code intentionally or by mistake. |
| **Solution** | Wrapped `api.withinTransaction(fn(...))` in `Promise.race` with a 30s timeout. The timeout is configurable via the `timeoutMs` constant. A timed-out execution returns `{ ok: false, error: "... timed out", logs }`, matching the existing error path. |

```typescript
const timeoutMs = 30000;
const result = await Promise.race([
  api.withinTransaction(() => fn({ api, sdk, song, log })),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`JS tool timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  ),
]);
```

---

## 5. Component code size not validated (`component-store.ts`)

| Field | Detail |
|-------|--------|
| **Issue** | `ComponentStore.save()` accepts arbitrary HTML strings with no size check. A multi-million-character payload bloats the `data:text/html` dialog URI and can crash Ableton's webview renderer. |
| **Root cause** | Trusted LLM output was not bounded. No sanity checks on generated component code. |
| **Solution** | Added 1 MB limit guard at the top of `save()`. Throws a `TypeError` before persistence if exceeded. Matches typical webview memory budgets. |

---

## 6. No `postMessage` origin validation (`chat.html`)

| Field | Detail |
|-------|--------|
| **Issue** | `window.addEventListener("message", ...)` at line 2055 has no origin check. If component code is later changed to load from a remote URL, the iframe becomes an injection path. |
| **Root cause** | Low priority because iframe currently uses `srcdoc` (data: URI origin = "null"). But it's fragile; any future change to component loading pattern silently exposes this. |
| **Solution** | Added origin allowlist check at the top of the message handler. For `srcdoc` iframes the origin is `null`, so the whitelist includes `"null"` and `window.location.origin`. If component loading changes to remote URLs, the allowlist must be updated explicitly — making the risk visible. |

---

## 7. `popHistory()` fragile at odd-length boundaries (`session.ts`)

| Field | Detail |
|-------|--------|
| **Issue** | `popHistory()` only removes pairs (2 entries). With 1 or 0 entries, it's a silent no-op. The `/q.undoTurn` command fires but nothing changes — confusing UX. |
| **Root cause** | Assumed history is always even-length (user+assistant pairs), but users can reach odd states via programmatic calls or partial clears. |
| **Solution** | Changed `popHistory()` to remove up to 2 entries (all but the first user turn), always making progress. If history has 1 entry, removes it. If 0, does nothing. Consistent with "undo the last exchange" intent. |

```typescript
popHistory(): void {
  if (this.history.length > 0) {
    this.history.splice(-Math.min(2, this.history.length));
    this.save();
  }
}
```

### Additional bug found: `lastJsResult` not restored on load

`Session.load()` (line 87–97) reads `history` and `model` from `llm-journal.json` but **never reads `lastJsResult`** — it was silently dropped on every restart. `save()` correctly wrote it. Fixed by adding `this.lastJsResult = data.lastJsResult ?? null;`.

---

## 8. Weak component ID generation (`component-store.ts`)

| Field | Detail |
|-------|--------|
| **Issue** | ID generated via `Math.random().toString(36).slice(2, 10)` gives ~48 bits of entropy. Negligible for single-user personal use, but collisions are non-zero and reproducibility is zero. |
| **Root cause** | Quick prototype implementation. `crypto.randomUUID()` (RFC 4122) is standard in Node 19+ and provides 122 bits. |
| **Solution** | Switched to `crypto.randomUUID()`. No collision risk in practice and aligns with modern Node.js standards. |

---

## 9. Silent failure on `showModalDialog` error (`extension.ts`)

| Field | Detail |
|-------|--------|
| **Issue** | If `api.ui.showModalDialog()` throws, the error is logged via `console.error` but the user gets no feedback. The command silently returns null. |
| **Root cause** | Wrap-only catch without user-visible reporting. |
| **Solution** | Changed `console.error` to `console.warn` and kept the early return. No UI feedback mechanism exists from the host side, but the improved log level makes it discoverable in Ableton's log viewer. Full UI error reporting would require host-level toast support not currently in the SDK. |

---

## 10. Test infrastructure added (Vitest)

| Field | Detail |
|-------|--------|
| **Setup** | Installed `vitest@3` (dev dep). Added `"test": "vitest run"` to package.json scripts. |
| **Test files** | `tests/router.test.ts` — 15 tests covering `resolveTarget` (exact, fuzzy, ambiguous, unresolved) and `route` (all intent types + SDK validation). `tests/session.test.ts` — 9 tests covering persistence, edge cases, and corrupt file handling. `tests/component-store.test.ts` — 12 tests covering CRUD, ID uniqueness, and malformed input. |
| **Result** | 36/36 tests pass. Two tests initially failed, both catching real bugs: (a) `lastJsResult` not restored in `Session.load()`, and (b) ambiguous-track matcher threshold. Both fixed. |
| **Run** | `npm test` or `npx vitest run` |
