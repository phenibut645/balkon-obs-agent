import {
  BROWSER_SOURCE_BASE_NAME,
  MEDIA_DEFAULT_URL,
  TEXT_SOURCE_BASE_NAME,
} from "./constants.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function generateUniqueSourceName(existingInputNames: Set<string>, baseName: string): string {
  if (!existingInputNames.has(baseName)) {
    return baseName;
  }

  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${baseName} ${i}`;
    if (!existingInputNames.has(candidate)) {
      return candidate;
    }
  }

  return `${baseName} ${Date.now()}`;
}

export function generateUniqueTextSourceName(existingInputNames: Set<string>): string {
  return generateUniqueSourceName(existingInputNames, TEXT_SOURCE_BASE_NAME);
}

export function generateUniqueBrowserSourceName(existingInputNames: Set<string>): string {
  return generateUniqueSourceName(existingInputNames, BROWSER_SOURCE_BASE_NAME);
}

export function getMediaOverlaySettings(url: string): {
  url: string;
  width: number;
  height: number;
  shutdown: boolean;
  restart_when_active: boolean;
} {
  return {
    url,
    width: 800,
    height: 450,
    shutdown: true,
    restart_when_active: true,
  };
}

export function getDefaultMediaOverlaySettings() {
  return getMediaOverlaySettings(MEDIA_DEFAULT_URL);
}

export async function sleep(durationMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, durationMs));
}
