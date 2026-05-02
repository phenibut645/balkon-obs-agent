import { AgentConfig, ObsRelaySceneItemRemovePayload, ObsRelaySceneItemRemoveResult, ObsRelaySceneItemVisibilitySetPayload, ObsRelaySceneItemVisibilitySetResult } from "../../shared/types.js";
import { ensureConnected, ObsConnectionContext } from "./connection.js";
import { getSceneItemIndexList } from "./sceneItemIndex.js";

export async function setSceneItemVisibilityForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelaySceneItemVisibilitySetPayload,
  listSceneItems: (config: AgentConfig, sceneName: string) => Promise<Array<{ sceneItemId: number; sourceName: string; enabled: boolean }>>,
): Promise<ObsRelaySceneItemVisibilitySetResult> {
  await ensureConnected(context, config);

  const sceneName = payload.sceneName.trim();
  if (!sceneName.length) {
    throw new Error("sceneName is required.");
  }

  const sceneItemId = payload.sceneItemId;
  if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const enabled = Boolean(payload.enabled);
  const sceneItems = await listSceneItems(config, sceneName);
  const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
  if (!matchingItem) {
    throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
  }

  if (payload.sourceName && payload.sourceName.trim().length > 0) {
    const expected = payload.sourceName.trim().toLowerCase();
    const actual = matchingItem.sourceName.trim().toLowerCase();
    if (expected !== actual) {
      context.log(
        "warn",
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Setting visibility anyway.`,
      );
    }
  }

  await context.obs.call("SetSceneItemEnabled", {
    sceneName,
    sceneItemId,
    sceneItemEnabled: enabled,
  });

  const items = await getSceneItemIndexList(context, sceneName);
  const refreshedItem = items.find(item => item.sceneItemId === sceneItemId);
  const finalEnabled = refreshedItem ? refreshedItem.enabled : enabled;

  return {
    sceneName,
    sceneItemId,
    sourceName: matchingItem.sourceName || null,
    enabled: finalEnabled,
    items: items.map(item => ({
      sceneItemId: item.sceneItemId,
      sourceName: item.sourceName,
      sceneItemIndex: item.sceneItemIndex,
      enabled: item.enabled,
    })),
  };
}

export async function removeSceneItemForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelaySceneItemRemovePayload,
  listSceneItems: (config: AgentConfig, sceneName: string) => Promise<Array<{ sceneItemId: number; sourceName: string; enabled: boolean }>>,
): Promise<ObsRelaySceneItemRemoveResult> {
  await ensureConnected(context, config);

  const sceneName = payload.sceneName.trim();
  if (!sceneName.length) {
    throw new Error("sceneName is required.");
  }

  const sceneItemId = payload.sceneItemId;
  if (!Number.isInteger(sceneItemId) || sceneItemId <= 0) {
    throw new Error("sceneItemId must be a positive integer.");
  }

  const sceneItems = await listSceneItems(config, sceneName);
  const matchingItem = sceneItems.find(item => item.sceneItemId === sceneItemId) ?? null;
  if (!matchingItem) {
    throw new Error(`Scene item ${sceneItemId} was not found in scene '${sceneName}'.`);
  }

  if (payload.sourceName && payload.sourceName.trim().length > 0) {
    const expected = payload.sourceName.trim().toLowerCase();
    const actual = matchingItem.sourceName.trim().toLowerCase();
    if (expected !== actual) {
      context.log(
        "warn",
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Removing anyway.`,
      );
    }
  }

  await context.obs.call("RemoveSceneItem", {
    sceneName,
    sceneItemId,
  });

  const items = await getSceneItemIndexList(context, sceneName);

  return {
    sceneName,
    sceneItemId,
    sourceName: matchingItem.sourceName || null,
    removed: true,
    items: items.map(item => ({
      sceneItemId: item.sceneItemId,
      sourceName: item.sourceName,
      sceneItemIndex: item.sceneItemIndex,
      enabled: item.enabled,
    })),
  };
}
