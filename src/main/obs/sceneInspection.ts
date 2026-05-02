import { AgentConfig, LogEntry, ObsRelaySceneItem, ObsRelaySceneItemsListResult, ObsRelaySceneView, ObsRelayScenesListResult } from "../../shared/types.js";
import { ensureConnected } from "./connection.js";
import { ObsConnectionContext } from "./connection.js";
import { ObsCurrentProgramSceneResponse, ObsGetInputSettingsResponse, ObsSceneItemListResponse, ObsSceneListResponse } from "./types.js";
import { formatError } from "./obsUtils.js";

type ObsCallable = {
  call: (...args: any[]) => Promise<any>;
};

export async function listScenes(context: ObsConnectionContext, config: AgentConfig): Promise<ObsRelaySceneView[]> {
  await ensureConnected(context, config);
  const result = await context.obs.call("GetSceneList") as ObsSceneListResponse;
  return (result.scenes ?? [])
    .map(scene => ({ sceneName: String(scene.sceneName ?? "") }))
    .filter(scene => scene.sceneName.length > 0);
}

export async function listSceneItems(context: ObsConnectionContext, config: AgentConfig, sceneName: string): Promise<ObsRelaySceneItem[]> {
  await ensureConnected(context, config);
  const result = await context.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
  return (result.sceneItems ?? [])
    .map(item => ({
      sceneItemId: Number(item.sceneItemId ?? NaN),
      sourceName: String(item.sourceName ?? ""),
      enabled: Boolean(item.sceneItemEnabled),
    }))
    .filter(item => Number.isFinite(item.sceneItemId) && item.sourceName.length > 0);
}

export async function listScenesForStudio(context: ObsConnectionContext, config: AgentConfig): Promise<ObsRelayScenesListResult> {
  await ensureConnected(context, config);
  const sceneList = await context.obs.call("GetSceneList") as ObsSceneListResponse;

  const scenes = (sceneList.scenes ?? [])
    .map(scene => String(scene.sceneName ?? "").trim())
    .filter(Boolean)
    .map(name => ({ name }));

  let currentProgramSceneName: string | null = typeof sceneList.currentProgramSceneName === "string"
    ? sceneList.currentProgramSceneName.trim() || null
    : null;

  if (!currentProgramSceneName) {
    try {
      const current = await context.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
      currentProgramSceneName = typeof current.currentProgramSceneName === "string"
        ? current.currentProgramSceneName.trim() || null
        : null;
    } catch {
      currentProgramSceneName = null;
    }
  }

  return { scenes, currentProgramSceneName };
}

export async function getInputKindSafe(obs: ObsCallable, log: (level: LogEntry["level"], message: string) => void, inputName: string): Promise<string | null> {
  try {
    const response = await obs.call("GetInputSettings", { inputName }) as ObsGetInputSettingsResponse;
    const kind = typeof response.inputKind === "string" ? response.inputKind.trim() : "";
    return kind.length ? kind : null;
  } catch (error) {
    log("warn", `GetInputSettings failed for '${inputName}': ${formatError(error)}`);
    return null;
  }
}

export async function getStudioSceneItemById(
  obs: ObsCallable,
  log: (level: LogEntry["level"], message: string) => void,
  sceneName: string,
  sceneItemId: number,
): Promise<{ sceneItemId: number; sourceName: string; enabled: boolean; inputKind: string | null } | null> {
  const result = await obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
  const matchingItem = (result.sceneItems ?? []).find(item => Number(item.sceneItemId ?? NaN) === sceneItemId) ?? null;
  if (!matchingItem) {
    return null;
  }

  const sourceName = String(matchingItem.sourceName ?? "").trim();
  if (!sourceName.length) {
    return null;
  }

  const rawInputKind = typeof matchingItem.inputKind === "string" ? matchingItem.inputKind.trim() : "";
  const inputKind = rawInputKind.length > 0 ? rawInputKind : await getInputKindSafe(obs, log, sourceName);

  return {
    sceneItemId,
    sourceName,
    enabled: Boolean(matchingItem.sceneItemEnabled),
    inputKind,
  };
}
