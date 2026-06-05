import * as fs from "node:fs";
import * as path from "node:path";

const SETTINGS_FILE = "llm-settings.json";

export interface ModelEntry {
  id: string;       // e.g. "claude-opus-4-6" or "my-fine-tune"
  label: string;    // display name shown in the selector
  provider: "anthropic" | "ollama";
}

export interface Settings {
  anthropicApiKey: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  models: ModelEntry[];
  activeModelId: string;
  mixpanelDistinctId?: string;   // stable anonymous install ID, generated on first capture
}

const DEFAULTS: Settings = {
  anthropicApiKey: "",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3",
  models: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
    { id: "claude-opus-4-6",   label: "Claude Opus 4.6",   provider: "anthropic" },
    { id: "local-ollama",      label: "Local (Ollama)",     provider: "ollama" },
  ],
  activeModelId: "claude-sonnet-4-5",
};

export class SettingsStore {
  private settingsPath: string | null;
  private data: Settings;

  constructor(storageDirectory: string | undefined) {
    this.settingsPath = storageDirectory
      ? path.join(storageDirectory, SETTINGS_FILE)
      : null;
    this.data = this.load();
  }

  get(): Settings {
    return { ...this.data };
  }

  set(patch: Partial<Settings>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  private save(): void {
    if (!this.settingsPath) return;
    try {
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify(this.data, null, 2),
        "utf8"
      );
    } catch (e) {
      console.error("[Q] Failed to save settings:", e);
    }
  }

  private load(): Settings {
    if (!this.settingsPath || !fs.existsSync(this.settingsPath)) {
      return { ...DEFAULTS };
    }
    try {
      const raw = fs.readFileSync(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<Settings>;
      // Merge with defaults so new fields added in updates are present
      return {
        ...DEFAULTS,
        ...parsed,
        models: parsed.models?.length ? parsed.models : DEFAULTS.models,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }
}
