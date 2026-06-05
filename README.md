# Ableton LLM Controller

Control Ableton Live with natural language via Claude (or a local Ollama model).
Built on the Ableton Extensions SDK v1.0.0-beta.0.

---

## Setup

### 1. Prerequisites

- Node.js ≥ 22.11
- Ableton Live with the Extensions SDK beta
- An Anthropic API key (for Claude) **or** [Ollama](https://ollama.ai) running locally

### 2. Install

Place the SDK tarballs alongside this folder, then:

```bash
npm install
```

### 3. Add your API key

The chat UI calls the Anthropic API directly from the modal's WebView.
Set your key in the HTML before building, or serve it via a local proxy.

In `src/ui/chat.html`, find the `fetch` call to `api.anthropic.com` and add:

```js
"x-api-key": "YOUR_KEY_HERE",
```

> For production use, proxy requests through a local server instead of
> embedding keys in HTML.

### 4. Build and run

```bash
npm run build        # compile + bundle
npm run start        # build + launch in Live via extensions-cli
```

---

## Usage

1. Right-click any **MIDI** or **Audio track** in Live → **"Ask Claude…"**
2. Type what you want in the chat panel (e.g. *"Mute the bass and add a reverb to vocals"*)
3. Claude replies with an explanation and proposes actions
4. Click **Apply ✓** to execute everything as one undo step

**Selection context:** Right-click while an arrangement region is selected to give Claude
time-range and track context automatically.

**Undo turn:** Click ↩ in the top bar to trim the last exchange from the journal.
Use Live's own **Ctrl+Z / Cmd+Z** to undo the changes in the session.

**Model selector:** Switch between Claude Sonnet, Opus, or a local Ollama model
in the top bar.

---

## Project structure

```
ableton-llm-controller/
├── manifest.json           Ableton extension manifest
├── package.json
├── tsconfig.json
├── build.ts                esbuild bundle script
└── src/
    ├── extension.ts        activate() — registers commands, opens dialog
    ├── snapshot.ts         Serialises Song state → system prompt JSON
    ├── executor.ts         Dispatches Action[] → SDK calls
    ├── session.ts          Persists conversation history to storageDirectory
    ├── schema.ts           Action union type + DialogResult
    └── ui/
        └── chat.html       Full chat UI (inlined by esbuild as a string)
```

---

## Available actions

| Action | What it does |
|--------|-------------|
| `set_tempo` | Change BPM |
| `mute/solo/arm_track` | Track controls |
| `rename_track` / `rename_clip` | Rename |
| `set_clip_color` / `set_clip_muted` | Clip properties |
| `create_midi_track` / `create_audio_track` | New tracks |
| `delete_track` / `duplicate_track` | Track management |
| `create_scene` / `delete_scene` | Scene management |
| `create_midi_clip_slot` | New MIDI clip in session view |
| `create_midi_clip_arr` | New MIDI clip in arrangement |
| `set_midi_notes` | Write notes into a MIDI clip |
| `delete_clip` | Remove a clip from a slot |
| `clear_clips_range` | Erase arrangement range |
| `insert_device` / `delete_device` / `duplicate_device` | Device chain |
| `set_device_param` | Set a device parameter by name |
| `create_cue_point` / `delete_cue_point` | Cue points |

All actions in one response are applied inside `withinTransaction()` — a single undo step in Live.
