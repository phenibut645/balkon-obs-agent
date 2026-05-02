import { AgentConfig, ObsRelaySceneItemIndexSetPayload, ObsRelaySceneItemIndexSetResult } from "../../shared/types.js";
import { ensureConnected, ObsConnectionContext } from "./connection.js";
import { ObsSceneItemListResponse } from "./types.js";

export async function getSceneItemIndexList(
  context: Pick<ObsConnectionContext, "obs">,
  sceneName: string,
): Promise<Array<{ sceneItemId: number; sourceName: string; sceneItemIndex: number }>> {
  const result = await context.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
  return (result.sceneItems ?? [])
    .map((item, index) => ({
      sceneItemId: Number(item.sceneItemId ?? NaN),
      sourceName: String(item.sourceName ?? "").trim(),
      sceneItemIndex: Number(item.sceneItemIndex ?? index),
    }))
    .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0)
    .map(item => ({
      sceneItemId: item.sceneItemId,
      sourceName: item.sourceName,
      sceneItemIndex: Number.isInteger(item.sceneItemIndex) && item.sceneItemIndex >= 0 ? item.sceneItemIndex : 0,
    }));
}

export async function setSceneItemIndexForStudio(
  context: ObsConnectionContext,
  config: AgentConfig,
  payload: ObsRelaySceneItemIndexSetPayload,
): Promise<ObsRelaySceneItemIndexSetResult> {
  await ensureConnected(context, config);

  const sceneName = payload.sceneName.trim();
  if (!sceneName.length) {
    throw new Error("sceneName is required.");
  }

  const sceneItemId = payload.sceneItemId;
  const sceneItemsResult = await context.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
  const sceneItems = (sceneItemsResult.sceneItems ?? [])
    .map((item, index) => ({
      sceneItemId: Number(item.sceneItemId ?? NaN),
      sourceName: String(item.sourceName ?? "").trim(),
      sceneItemIndex: Number(item.sceneItemIndex ?? index),
    }))
    .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0);

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
        `Scene item source mismatch for ${sceneName}#${sceneItemId}: expected '${payload.sourceName}', got '${matchingItem.sourceName}'. Applying index change anyway.`,
      );
    }
  }

  const maxIndex = Math.max(0, sceneItems.length - 1);
  const normalizedIndex = Math.min(maxIndex, Math.max(0, payload.sceneItemIndex));

  await context.obs.call("SetSceneItemIndex", {
    sceneName,
    sceneItemId,
    sceneItemIndex: normalizedIndex,
  });

  const refreshedItems = await getSceneItemIndexList(context, sceneName);
  const refreshedTarget = refreshedItems.find(item => item.sceneItemId === sceneItemId) ?? null;

  return {
    sceneName,
    sceneItemId,
    sourceName: matchingItem.sourceName || null,
    sceneItemIndex: refreshedTarget?.sceneItemIndex ?? normalizedIndex,
    items: refreshedItems,
  };
}
