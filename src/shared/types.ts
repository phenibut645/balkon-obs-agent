export type RelayStatus = "disconnected" | "connecting" | "connected" | "error";
export type ObsStatus = "disconnected" | "connected" | "waiting" | "error";
export type UpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface AgentConfig {
  relayUrl: string;
  agentId: string;
  agentToken: string;
  obsUrl: string;
  obsPassword: string;
}

export interface AgentState {
  relayStatus: RelayStatus;
  obsStatus: ObsStatus;
  lastError: string | null;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

export interface ObsTestResult {
  ok: boolean;
  message: string;
  obsVersion?: string | null;
  websocketVersion?: string | null;
  currentSceneName?: string | null;
}

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
  message: string;
}

export interface RendererApi {
  getVersion(): Promise<string>;
  loadConfig(): Promise<AgentConfig>;
  saveConfig(config: AgentConfig): Promise<AgentConfig>;
  connect(config: AgentConfig): Promise<AgentState>;
  disconnect(): Promise<AgentState>;
  testObs(config: AgentConfig): Promise<ObsTestResult>;
  checkForUpdates(): Promise<UpdateState>;
  installUpdate(): Promise<UpdateState>;
  loadSettings(): Promise<AgentSettings>;
  saveSettings(settings: AgentSettings): Promise<AgentSettings>;
  onStateChange(callback: (state: AgentState) => void): () => void;
  onLog(callback: (entry: LogEntry) => void): () => void;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  onTrayAction(callback: (action: "open" | "connect" | "disconnect") => void): () => void;
}

export const DEFAULT_CONFIG: AgentConfig = {
  relayUrl: "wss://venomancer.aleksandermilisenko23.thkit.ee/",
  agentId: "",
  agentToken: "",
  obsUrl: "ws://127.0.0.1:4455",
  obsPassword: "",
};

export interface AgentSettings {
  startWithWindows: boolean;
  startMinimizedToTray: boolean;
  autoConnectOnLaunch: boolean;
  autoRetryObs: boolean;
  language: "en" | "ru" | "et";
}

export const DEFAULT_SETTINGS: AgentSettings = {
  startWithWindows: false,
  startMinimizedToTray: false,
  autoConnectOnLaunch: false,
  autoRetryObs: true,
  language: "en",
};

export type ObsRelayCommandName =
  | "obs.getStatus"
  | "obs.listScenes"
  | "obs.listSceneItems"
  | "obs.scenes.list"
  | "obs.scene.items.list"
  | "obs.scene.item.transform.set"
  | "obs.scene.item.index.set"
  | "obs.scene.item.visibility.set"
  | "obs.scene.item.remove"
  | "obs.scene.source.text.create"
  | "obs.scene.source.browser.create"
  | "obs.switchScene"
  | "obs.setSourceVisibility"
  | "obs.setTextInputText"
  | "obs.triggerMediaInputAction"
  | "obs.media.show";

export interface ObsRelayHelloMessage {
  type: "hello";
  agentId: string;
  agentToken: string;
}

export interface ObsRelayHelloAckMessage {
  type: "hello_ack";
  agentId: string;
}

export interface ObsRelayPingMessage {
  type: "ping";
  ts: number;
}

export interface ObsRelayPongMessage {
  type: "pong";
  ts: number;
}

export interface ObsRelayErrorMessage {
  type: "error";
  requestId?: string;
  error: string;
}

export interface ObsRelayCommandMessage {
  type: "command";
  requestId: string;
  command: ObsRelayCommandName | string;
  payload?: Record<string, unknown>;
}

export interface ObsRelayCommandResultMessage {
  type: "command_result";
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ObsRelayLegacyResultMessage {
  type: "result";
  requestId: string;
  result?: unknown;
}

export interface ObsRelayLegacyErrorMessage {
  type: "error";
  requestId: string;
  error: string;
}

export interface ObsRelayGetStatusResult {
  connected: boolean;
  currentSceneName: string | null;
  endpoint: string | null;
  obsVersion: string | null;
  websocketVersion: string | null;
}

export interface ObsRelaySceneView {
  sceneName: string;
}

export interface ObsRelaySceneItem {
  sceneItemId: number;
  sourceName: string;
  enabled: boolean;
}

export interface ObsRelayScenesListResult {
  scenes: Array<{ name: string }>;
  currentProgramSceneName: string | null;
}

export interface ObsRelaySceneItemTransform {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  width?: number;
  height?: number;
}

export interface ObsRelaySceneItemsListItem {
  sceneItemId: number;
  sourceName: string;
  inputKind: string | null;
  enabled: boolean;
  transform: ObsRelaySceneItemTransform;
}

export interface ObsRelaySceneItemsListResult {
  sceneName: string;
  items: ObsRelaySceneItemsListItem[];
}

export interface ObsRelaySceneItemTransformSetPayload {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  transform: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation?: number;
  };
}

export interface ObsRelaySceneItemTransformSetResult {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  transform: ObsRelaySceneItemTransform;
}

export interface ObsRelaySceneItemIndexSetPayload {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  sceneItemIndex: number;
}

export interface ObsRelaySceneItemIndexListItem {
  sceneItemId: number;
  sourceName: string;
  sceneItemIndex: number;
}

export interface ObsRelaySceneItemIndexSetResult {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  sceneItemIndex: number;
  items: ObsRelaySceneItemIndexListItem[];
}

export interface ObsRelayTextSourceCreatePayload {
  sceneName: string;
  sourceName?: string | null;
  text: string;
  positionX?: number;
  positionY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface ObsRelayTextSourceCreateResult {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: string;
  transform: ObsRelaySceneItemTransform;
  items: ObsRelaySceneItemIndexListItem[];
}

export interface ObsRelayBrowserSourceCreatePayload {
  sceneName: string;
  sourceName?: string | null;
  url: string;
  width?: number;
  height?: number;
  positionX?: number;
  positionY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface ObsRelayBrowserSourceCreateResult {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: "browser_source";
  url: string;
  width: number;
  height: number;
  transform: ObsRelaySceneItemTransform;
  items: ObsRelaySceneItemIndexListItem[];
}

export interface ObsRelaySceneItemVisibilitySetPayload {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  enabled: boolean;
}

export interface ObsRelaySceneItemVisibilitySetResult {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  enabled: boolean;
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
    enabled?: boolean;
  }>;
}

export interface ObsRelaySceneItemRemovePayload {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
}

export interface ObsRelaySceneItemRemoveResult {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  removed: true;
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
    enabled?: boolean;
  }>;
}

export type ObsMediaAction =
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NONE"
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY"
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE"
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP"
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT"
  | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS";

export interface ObsRelayMediaShowPayload {
  kind: "image" | "gif";
  url: string;
  durationMs: number;
  title: string;
}
