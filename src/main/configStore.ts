import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { AgentConfig, DEFAULT_CONFIG } from "../shared/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export class ConfigStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "config.json");
  }

  async load(): Promise<AgentConfig> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed)) {
        return DEFAULT_CONFIG;
      }

      return {
        relayUrl: normalizeString(parsed.relayUrl, DEFAULT_CONFIG.relayUrl),
        agentId: normalizeString(parsed.agentId, DEFAULT_CONFIG.agentId),
        agentToken: normalizeString(parsed.agentToken, DEFAULT_CONFIG.agentToken),
        obsUrl: normalizeString(parsed.obsUrl, DEFAULT_CONFIG.obsUrl),
        obsPassword: normalizeString(parsed.obsPassword, DEFAULT_CONFIG.obsPassword),
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async save(config: AgentConfig): Promise<AgentConfig> {
    const normalized = this.normalize(config);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
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
