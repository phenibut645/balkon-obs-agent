import { AgentConfig, ObsRelaySourceSettingsGetPayload, ObsRelaySourceSettingsGetResult } from "../../shared/types.js";
import { BROWSER_SOURCE_KIND, TEXT_SOURCE_KINDS } from "./constants.js";
import { ensureConnected, ObsConnectionContext } from "./connection.js";
import { getStudioSceneItemById } from "./sceneInspection.js";
import { ObsGetInputSettingsResponse } from "./types.js";
import { formatError, isPlainObject } from "./obsUtils.js";

export async function getSourceSettingsForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelaySourceSettingsGetPayload,
): Promise<ObsRelaySourceSettingsGetResult> {
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

  const matchingItem = await getStudioSceneItemById(context.obs, context.log, sceneName, sceneItemId);
  if (!matchingItem) {
    throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
  }

  if (providedSourceName.length > 0) {
    const expected = providedSourceName.toLowerCase();
    const actual = matchingItem.sourceName.toLowerCase();
    if (expected !== actual) {
      context.log(
        "warn",
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${providedSourceName}', got '${matchingItem.sourceName}'. Reading settings anyway.`,
      );
    }
  }

  const sourceName = matchingItem.sourceName;

  let inputInfo: ObsGetInputSettingsResponse;
  try {
    inputInfo = await context.obs.call("GetInputSettings", { inputName: sourceName }) as ObsGetInputSettingsResponse;
  } catch (error) {
    throw new Error(
      `Source '${sourceName}' is not an OBS input or its settings could not be read: ${formatError(error)}`,
    );
  }

  const inputKind = typeof inputInfo.inputKind === "string" && inputInfo.inputKind.trim().length > 0
    ? inputInfo.inputKind.trim()
    : (matchingItem.inputKind ?? null);
  const inputSettings = isPlainObject(inputInfo.inputSettings) ? inputInfo.inputSettings : null;
  const settings: ObsRelaySourceSettingsGetResult["settings"] = {};

  if (inputKind && TEXT_SOURCE_KINDS.includes(inputKind as (typeof TEXT_SOURCE_KINDS)[number])) {
    const textValue = inputSettings?.text;
    if (typeof textValue === "string") {
      settings.text = textValue;
    }
  } else if (inputKind === BROWSER_SOURCE_KIND) {
    const urlValue = inputSettings?.url;
    if (typeof urlValue === "string") {
      settings.url = urlValue;
    }

    const widthValue = inputSettings?.width;
    if (typeof widthValue === "number" && Number.isFinite(widthValue)) {
      settings.width = widthValue;
    }

    const heightValue = inputSettings?.height;
    if (typeof heightValue === "number" && Number.isFinite(heightValue)) {
      settings.height = heightValue;
    }
  }

  return {
    sceneName,
    sceneItemId,
    sourceName,
    inputKind,
    settings,
  };
}
