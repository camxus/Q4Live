import * as fs from "node:fs";
import * as path from "node:path";

const SETTINGS_FILE = "llm-settings.json";

export interface ModelEntry {
  id: string;
  label: string;
  provider: "anthropic" | "openai" | "gemini" | "ollama" | "custom";
}

export interface Settings {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  customEndpoint: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  models: ModelEntry[];
  activeModelId: string;
  mixpanelDistinctId?: string;
}

const DEFAULTS: Settings = {
  anthropicApiKey: "",
  openaiApiKey:    "",
  geminiApiKey:    "",
  customEndpoint:  "",
  ollamaEndpoint:  "http://localhost:11434",
  ollamaModel:     "llama3",
  models: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
    { id: "claude-opus-4-6",   label: "Claude Opus 4.6",   provider: "anthropic" },
    { id: "gpt-4o",            label: "GPT-4o",            provider: "openai" },
    { id: "gpt-4o-mini",       label: "GPT-4o mini",       provider: "openai" },
    { id: "gemini-2.0-flash",  label: "Gemini 2.0 Flash",  provider: "gemini" },
    { id: "gemini-1.5-pro",    label: "Gemini 1.5 Pro",    provider: "gemini" },
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

  get(): Settings { return { ...this.data }; }

  set(patch: Partial<Settings>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  private save(): void {
    if (!this.settingsPath) return;
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.data, null, 2), "utf8");
    } catch (e) {
      console.error("[Q] Failed to save settings:", e);
    }
  }

  private load(): Settings {
    if (!this.settingsPath || !fs.existsSync(this.settingsPath)) return { ...DEFAULTS };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")) as Partial<Settings>;
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
