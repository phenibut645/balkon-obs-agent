import OBSWebSocket from "obs-websocket-js";
import { AgentConfig, LogEntry, ObsRelayGetStatusResult, ObsTestResult } from "../../shared/types.js";
import { AGENT_VERSION, RELAY_PROTOCOL_VERSION } from "../../shared/agentMetadata.js";
import { ObsConnectResponse, ObsCurrentProgramSceneResponse, ObsVersionResponse } from "./types.js";

export type ObsConnectionState = {
  connected: boolean;
  connectedUrl: string | null;
  connectedPassword: string | null;
  lastObsVersion: string | null;
  lastWebsocketVersion: string | null;
};

export type ObsConnectionContext = {
  obs: OBSWebSocket;
  setObs: (obs: OBSWebSocket) => void;
  state: ObsConnectionState;
  log: (level: LogEntry["level"], message: string) => void;
  disconnect: () => Promise<void>;
  ensureMediaOverlaySetupForCurrentScene: () => Promise<void>;
};

export function getConnectionMetadata(state: ObsConnectionState) {
  return {
    obsConnected: state.connected,
    obsVersion: state.lastObsVersion,
    websocketVersion: state.lastWebsocketVersion,
  };
}

export async function testConnection(context: ObsConnectionContext, config: AgentConfig): Promise<ObsTestResult> {
  try {
    await ensureConnected(context, config);
    const version = await context.obs.call("GetVersion") as ObsVersionResponse;
    const currentScene = await context.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
    context.state.lastObsVersion = version.obsVersion ?? null;
    context.state.lastWebsocketVersion = version.obsWebSocketVersion ?? context.state.lastWebsocketVersion;

    return {
      ok: true,
      message: `Connected to OBS${currentScene.currentProgramSceneName ? `, current scene: ${currentScene.currentProgramSceneName}` : ""}.`,
      obsVersion: context.state.lastObsVersion,
      websocketVersion: context.state.lastWebsocketVersion,
      currentSceneName: currentScene.currentProgramSceneName ?? null,
    };
  } catch (error) {
    context.state.connected = false;
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to connect to OBS.",
    };
  }
}

export async function getStatus(context: ObsConnectionContext, config: AgentConfig): Promise<ObsRelayGetStatusResult> {
  try {
    await ensureConnected(context, config);
    const currentScene = await context.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
    const version = await context.obs.call("GetVersion") as ObsVersionResponse;
    context.state.lastObsVersion = version.obsVersion ?? null;
    context.state.lastWebsocketVersion = version.obsWebSocketVersion ?? context.state.lastWebsocketVersion;

    return {
      connected: true,
      currentSceneName: currentScene.currentProgramSceneName ?? null,
      endpoint: config.obsUrl,
      obsVersion: context.state.lastObsVersion,
      websocketVersion: context.state.lastWebsocketVersion,
      agentVersion: AGENT_VERSION,
      relayProtocolVersion: RELAY_PROTOCOL_VERSION,
      obsConnected: true,
    };
  } catch {
    context.state.connected = false;
    return {
      connected: false,
      currentSceneName: null,
      endpoint: config.obsUrl,
      obsVersion: context.state.lastObsVersion,
      websocketVersion: context.state.lastWebsocketVersion,
      agentVersion: AGENT_VERSION,
      relayProtocolVersion: RELAY_PROTOCOL_VERSION,
      obsConnected: false,
    };
  }
}

export async function disconnectClient(context: ObsConnectionContext): Promise<void> {
  if (!context.state.connected) {
    return;
  }

  try {
    await context.obs.disconnect();
  } finally {
    context.state.connected = false;
    context.state.connectedUrl = null;
    context.state.connectedPassword = null;
  }
}

export async function ensureConnected(context: ObsConnectionContext, config: AgentConfig): Promise<void> {
  const password = config.obsPassword.length ? config.obsPassword : undefined;
  const passwordKey = password ?? null;
  const configChanged = context.state.connectedUrl !== config.obsUrl || context.state.connectedPassword !== passwordKey;

  if (context.state.connected && !configChanged) {
    return;
  }

  if (context.state.connected && configChanged) {
    await context.disconnect();
  }

  const obs = new OBSWebSocket();
  obs.on("ConnectionClosed", () => {
    context.state.connected = false;
  });
  context.setObs(obs);

  const result = await obs.connect(config.obsUrl, password) as ObsConnectResponse;
  context.state.connected = true;
  context.state.connectedUrl = config.obsUrl;
  context.state.connectedPassword = passwordKey;
  context.state.lastWebsocketVersion = result.obsWebSocketVersion ?? null;

  await context.ensureMediaOverlaySetupForCurrentScene();
}

export async function getAvailableRequests(context: Pick<ObsConnectionContext, "obs" | "state">): Promise<Set<string>> {
  const version = await context.obs.call("GetVersion") as ObsVersionResponse;
  context.state.lastObsVersion = version.obsVersion ?? null;
  context.state.lastWebsocketVersion = version.obsWebSocketVersion ?? context.state.lastWebsocketVersion;
  return new Set(version.availableRequests ?? []);
}
