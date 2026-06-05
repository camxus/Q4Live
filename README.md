# Ableton LLM Controller

Control Ableton Live with natural language via Claude (or a local Ollama model).
Built on the Ableton Extensions SDK v1.0.0-beta.0.

---

## Setup

### 1. Prerequisites

* Node.js ≥ 22.11
* Ableton Live with the Extensions SDK beta
* An Anthropic API key (for Claude), an OpenAI-compatible API endpoint, **or** [Ollama](https://ollama.ai) running locally

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

> For production use, proxy requests through a local server instead of embedding API keys in HTML.

### 4. Build

```bash
npm run build
```

Compiles TypeScript and bundles the extension using esbuild.

### 5. Run in Ableton Live

```bash
npm run start
```

Builds the project and launches it through `extensions-cli`.

### 6. Package as an `.ablx` Extension

To create a distributable Ableton extension package:

```bash
npm run package
```

The generated `.ablx` file can be installed in Ableton Live through the Extensions Manager or distributed to other users running the Ableton Extensions SDK.

---

## Usage

1. Right-click any **MIDI** or **Audio track** in Live → **"Ask Q…"**
2. Type what you want in the chat panel (e.g. *"Mute the bass and add a reverb to vocals"*)
3. Q replies with an explanation and proposes actions
4. Click **Apply ✓** to execute everything as one undo step

### Selection Context

Right-click while an arrangement region is selected to automatically provide:

* Selected tracks
* Time range
* Arrangement context

This allows the model to make more targeted edits.

### Undo

* Click **↩** in the chat header to remove the latest conversation turn
* Use **Cmd+Z / Ctrl+Z** in Ableton Live to undo all applied actions

### Model Selection

Switch between:

- Anthropic
  - Claude Sonnet
  - Claude Opus

- OpenAI
  - GPT-4o
  - GPT-4o mini

- Google Gemini
  - Gemini 2.0 Flash
  - Gemini 1.5 Pro

- Local Models
  - Ollama (any installed model)

- Custom OpenAI-Compatible APIs
  - OpenRouter
  - Together AI
  - Groq
  - Self-hosted proxies
  - Any endpoint implementing the OpenAI Chat Completions API

using the selector in the top toolbar.

---

## Project Structure

```text
ableton-llm-controller/
├── manifest.json           Ableton extension manifest
├── package.json
├── tsconfig.json
├── build.ts                esbuild bundle script
└── src/
    ├── extension.ts        activate() — registers commands, opens dialog
    ├── snapshot.ts         Serializes Song state → system prompt JSON
    ├── executor.ts         Dispatches Action[] → SDK calls
    ├── session.ts          Persists conversation history to storageDirectory
    ├── schema.ts           Action union type + DialogResult
    └── ui/
        └── chat.html       Full chat UI (inlined by esbuild as a string)
```

---

## Available Actions

| Action                  | Description                            |
| ----------------------- | -------------------------------------- |
| `set_tempo`             | Change project BPM                     |
| `mute_track`            | Mute a track                           |
| `solo_track`            | Solo a track                           |
| `arm_track`             | Arm a track for recording              |
| `rename_track`          | Rename a track                         |
| `rename_clip`           | Rename a clip                          |
| `set_clip_color`        | Change clip color                      |
| `set_clip_muted`        | Mute or unmute a clip                  |
| `create_midi_track`     | Create a MIDI track                    |
| `create_audio_track`    | Create an audio track                  |
| `delete_track`          | Delete a track                         |
| `duplicate_track`       | Duplicate a track                      |
| `create_scene`          | Create a scene                         |
| `delete_scene`          | Delete a scene                         |
| `create_midi_clip_slot` | Create a MIDI clip in Session View     |
| `create_midi_clip_arr`  | Create a MIDI clip in Arrangement View |
| `set_midi_notes`        | Write MIDI notes into a clip           |
| `delete_clip`           | Delete a clip                          |
| `clear_clips_range`     | Remove clips in an arrangement range   |
| `insert_device`         | Insert a device                        |
| `delete_device`         | Delete a device                        |
| `duplicate_device`      | Duplicate a device                     |
| `set_device_param`      | Set a device parameter by name         |
| `create_cue_point`      | Create a cue point                     |
| `delete_cue_point`      | Delete a cue point                     |

---

## Transactions and Undo

All actions returned by the model are executed inside a single:

```ts
withinTransaction()
```

This means every change generated from a single prompt becomes one Ableton Live undo step.

---

## Notes

* Q receives a structured snapshot of the current Live Set rather than raw project files.
* Conversation history is stored locally inside the extension storage directory.
* Ollama support enables fully local operation without external API calls.
* The extension never modifies the Live Set until the user explicitly clicks **Apply**.
