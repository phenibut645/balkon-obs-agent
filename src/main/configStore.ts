import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { AgentConfig, AgentSettings, DEFAULT_CONFIG, DEFAULT_SETTINGS } from "../shared/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeLanguage(value: unknown, fallback: "en" | "ru" | "et"): "en" | "ru" | "et" {
  return value === "en" || value === "ru" || value === "et" ? value : fallback;
}

export class ConfigStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "config.json");
  }

  private async readRaw(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeRaw(data: Record<string, unknown>): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async load(): Promise<AgentConfig> {
    const parsed = await this.readRaw();
    return {
      relayUrl: normalizeString(parsed.relayUrl, DEFAULT_CONFIG.relayUrl),
      agentId: normalizeString(parsed.agentId, DEFAULT_CONFIG.agentId),
      agentToken: normalizeString(parsed.agentToken, DEFAULT_CONFIG.agentToken),
      obsUrl: normalizeString(parsed.obsUrl, DEFAULT_CONFIG.obsUrl),
      obsPassword: normalizeString(parsed.obsPassword, DEFAULT_CONFIG.obsPassword),
    };
  }

  async save(config: AgentConfig): Promise<AgentConfig> {
    const normalized = this.normalize(config);
    const current = await this.readRaw();
    await this.writeRaw({ ...current, ...normalized });
    return normalized;
  }

  async loadSettings(): Promise<AgentSettings> {
    const parsed = await this.readRaw();
    const s = isRecord(parsed.settings) ? parsed.settings : {};
    return {
      startWithWindows: normalizeBoolean(s.startWithWindows, DEFAULT_SETTINGS.startWithWindows),
      startMinimizedToTray: normalizeBoolean(s.startMinimizedToTray, DEFAULT_SETTINGS.startMinimizedToTray),
      autoConnectOnLaunch: normalizeBoolean(s.autoConnectOnLaunch, DEFAULT_SETTINGS.autoConnectOnLaunch),
      autoRetryObs: normalizeBoolean(s.autoRetryObs, DEFAULT_SETTINGS.autoRetryObs),
      language: normalizeLanguage(s.language, DEFAULT_SETTINGS.language),
    };
  }

  async saveSettings(settings: AgentSettings): Promise<AgentSettings> {
    const current = await this.readRaw();
    await this.writeRaw({ ...current, settings });
    return settings;
  }

  normalize(config: AgentConfig): AgentConfig {
    return {
      relayUrl: config.relayUrl.trim() || DEFAULT_CONFIG.relayUrl,
      agentId: config.agentId.trim(),
      agentToken: config.agentToken.trim(),
      obsUrl: config.obsUrl.trim() || DEFAULT_CONFIG.obsUrl,
      obsPassword: config.obsPassword,
    };
  }
}
