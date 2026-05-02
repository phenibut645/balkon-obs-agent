import { AgentConfig, ObsRelayBrowserSourceUpdatePayload, ObsRelayBrowserSourceUpdateResult, ObsRelayTextSourceUpdatePayload, ObsRelayTextSourceUpdateResult } from "../../shared/types.js";
import { BROWSER_SOURCE_KIND, TEXT_SOURCE_KINDS } from "./constants.js";
import { ensureConnected, ObsConnectionContext } from "./connection.js";
import { listSceneItems } from "./sceneInspection.js";
import { ObsGetInputSettingsResponse } from "./types.js";
import { formatError, isPlainObject } from "./obsUtils.js";

export async function updateTextSourceForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelayTextSourceUpdatePayload,
): Promise<ObsRelayTextSourceUpdateResult> {
  await ensureConnected(context, config);

  const sceneName = payload.sceneName.trim();
  if (!sceneName.length || sceneName.length > 160) {
    throw new Error("sceneName must be a non-empty string up to 160 characters.");
  }

  const sceneItemId = payload.sceneItemId;
  if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const providedSourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
  if (providedSourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  const rawText = typeof payload.text === "string" ? payload.text : "";
  const normalizedText = rawText.trim();
  if (!normalizedText.length || normalizedText.length > 500) {
    throw new Error("text must be a non-empty string up to 500 characters.");
  }

  const sceneItems = await listSceneItems(context, config, sceneName);
  const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
  if (!matchingItem) {
    throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
  }

  if (providedSourceName.length > 0) {
    const expected = providedSourceName.toLowerCase();
    const actual = matchingItem.sourceName.trim().toLowerCase();
    if (expected !== actual) {
      context.log(
        "warn",
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${providedSourceName}', got '${matchingItem.sourceName}'. Updating text anyway.`,
      );
    }
  }

  const sourceName = matchingItem.sourceName.trim();
  let inputKind: string | null = null;

  try {
    const inputInfo = await context.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
    const kindRaw = typeof inputInfo.inputKind === "string" ? inputInfo.inputKind.trim() : "";
    if (kindRaw.length) {
      inputKind = kindRaw;
    }

    if (inputKind && !TEXT_SOURCE_KINDS.includes(inputKind as (typeof TEXT_SOURCE_KINDS)[number])) {
      throw new Error(`Source '${sourceName}' is not a supported text input (kind: ${inputKind}).`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Source")) {
      throw error;
    }
    context.log("warn", `GetInputSettings failed for text source '${sourceName}': ${formatError(error)}`);
  }

  await context.obs.call("SetInputSettings", {
    inputName: sourceName,
    inputSettings: { text: normalizedText },
    overlay: true,
  });

  let finalText = normalizedText;
  try {
    const refreshed = await context.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
    const kindRaw = typeof refreshed.inputKind === "string" ? refreshed.inputKind.trim() : "";
    if (!inputKind && kindRaw.length) {
      inputKind = kindRaw;
    }

    if (isPlainObject(refreshed.inputSettings)) {
      const textValue = refreshed.inputSettings.text;
      if (typeof textValue === "string") {
        finalText = textValue;
      }
    }
  } catch (error) {
    context.log("warn", `GetInputSettings after text update failed for '${sourceName}': ${formatError(error)}`);
  }

  inputKind = inputKind && inputKind.length ? inputKind : null;

  return {
    sceneName,
    sceneItemId,
    sourceName,
    inputKind,
    text: finalText,
  };
}

export async function updateBrowserSourceForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelayBrowserSourceUpdatePayload,
): Promise<ObsRelayBrowserSourceUpdateResult> {
  await ensureConnected(context, config);

  const sceneName = payload.sceneName.trim();
  if (!sceneName.length || sceneName.length > 160) {
    throw new Error("sceneName must be a non-empty string up to 160 characters.");
  }

  const sceneItemId = payload.sceneItemId;
  if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const providedSourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
  if (providedSourceName.length > 160) {
    throw new Error("sourceName must be 160 characters or fewer.");
  }

  const rawUrl = payload.url;
  let normalizedUrl: string | undefined;
  if (rawUrl !== undefined && rawUrl !== null) {
    if (typeof rawUrl !== "string") {
      throw new Error("url must be a string when provided.");
    }
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl.length || trimmedUrl.length > 1000) {
      throw new Error("url must be a non-empty string up to 1000 characters.");
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      throw new Error("url must be a valid http:// or https:// URL.");
    }
    normalizedUrl = trimmedUrl;
  }

  const widthRaw = payload.width === undefined || payload.width === null ? undefined : Number(payload.width);
  if (widthRaw !== undefined && !Number.isFinite(widthRaw)) {
    throw new Error("width must be a finite number.");
  }

  const heightRaw = payload.height === undefined || payload.height === null ? undefined : Number(payload.height);
  if (heightRaw !== undefined && !Number.isFinite(heightRaw)) {
    throw new Error("height must be a finite number.");
  }

  if (normalizedUrl === undefined && widthRaw === undefined && heightRaw === undefined) {
    throw new Error("At least one of url, width, or height must be provided.");
  }

  const normalizedWidth = widthRaw === undefined ? undefined : Math.min(3840, Math.max(64, Math.round(widthRaw)));
  const normalizedHeight = heightRaw === undefined ? undefined : Math.min(2160, Math.max(64, Math.round(heightRaw)));

  const sceneItems = await listSceneItems(context, config, sceneName);
  const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
  if (!matchingItem) {
    throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
  }

  if (providedSourceName.length > 0) {
    const expected = providedSourceName.toLowerCase();
    const actual = matchingItem.sourceName.trim().toLowerCase();
    if (expected !== actual) {
      context.log(
        "warn",
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${providedSourceName}', got '${matchingItem.sourceName}'. Updating browser source anyway.`,
      );
    }
  }

  const sourceName = matchingItem.sourceName.trim();
  let inputKind: string | null = null;
  let fallbackUrl: string | undefined;
  let fallbackWidth: number | undefined;
  let fallbackHeight: number | undefined;

  try {
    const inputInfo = await context.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
    const kindRaw = typeof inputInfo.inputKind === "string" ? inputInfo.inputKind.trim() : "";
    if (kindRaw.length) {
      inputKind = kindRaw;
    }

    if (inputKind && inputKind !== BROWSER_SOURCE_KIND) {
      throw new Error(`Source '${sourceName}' is not a browser source (kind: ${inputKind}).`);
    }

    if (isPlainObject(inputInfo.inputSettings)) {
      const urlValue = inputInfo.inputSettings.url;
      if (typeof urlValue === "string") {
        fallbackUrl = urlValue;
      }

      const widthValue = inputInfo.inputSettings.width;
      if (typeof widthValue === "number" && Number.isFinite(widthValue)) {
        fallbackWidth = widthValue;
      }

      const heightValue = inputInfo.inputSettings.height;
      if (typeof heightValue === "number" && Number.isFinite(heightValue)) {
        fallbackHeight = heightValue;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Source")) {
      throw error;
    }
    context.log("warn", `GetInputSettings failed for browser source '${sourceName}': ${formatError(error)}`);
  }

  const nextSettings: Record<string, string | number> = {};
  if (normalizedUrl !== undefined) {
    nextSettings.url = normalizedUrl;
  }
  if (normalizedWidth !== undefined) {
    nextSettings.width = normalizedWidth;
  }
  if (normalizedHeight !== undefined) {
    nextSettings.height = normalizedHeight;
  }

  await context.obs.call("SetInputSettings", {
    inputName: sourceName,
    inputSettings: nextSettings,
    overlay: true,
  });

  let finalUrl = normalizedUrl ?? fallbackUrl;
  let finalWidth = normalizedWidth ?? fallbackWidth;
  let finalHeight = normalizedHeight ?? fallbackHeight;

  try {
    const refreshed = await context.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
    const kindRaw = typeof refreshed.inputKind === "string" ? refreshed.inputKind.trim() : "";
    if (!inputKind && kindRaw.length) {
      inputKind = kindRaw;
    }

    if (isPlainObject(refreshed.inputSettings)) {
      const urlValue = refreshed.inputSettings.url;
      if (typeof urlValue === "string") {
        finalUrl = urlValue;
      }

      const widthValue = refreshed.inputSettings.width;
      if (typeof widthValue === "number" && Number.isFinite(widthValue)) {
        finalWidth = widthValue;
      }

      const heightValue = refreshed.inputSettings.height;
      if (typeof heightValue === "number" && Number.isFinite(heightValue)) {
        finalHeight = heightValue;
      }
    }
  } catch (error) {
    context.log("warn", `GetInputSettings after browser update failed for '${sourceName}': ${formatError(error)}`);
  }

  inputKind = inputKind && inputKind.length ? inputKind : null;

  return {
    sceneName,
    sceneItemId,
    sourceName,
    inputKind,
    url: finalUrl,
    width: finalWidth,
    height: finalHeight,
  };
}
