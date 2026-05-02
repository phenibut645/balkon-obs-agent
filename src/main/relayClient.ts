import { WebSocket } from "ws";
import {
  AgentConfig,
  AgentState,
  LogEntry,
  ObsMediaAction,
  ObsRelayMediaShowPayload,
  ObsRelaySceneItemIndexSetPayload,
  ObsRelaySceneItemTransformSetPayload,
  ObsRelaySceneItemVisibilitySetPayload,
  ObsRelaySceneItemRemovePayload,
  ObsRelaySourceSettingsGetPayload,
  ObsRelayTextSourceCreatePayload,
  ObsRelayTextSourceUpdatePayload,
  ObsRelayBrowserSourceCreatePayload,
  ObsRelayBrowserSourceUpdatePayload,
  ObsRelayCommandMessage,
  ObsRelayCommandResultMessage,
  ObsRelayErrorMessage,
  ObsRelayHelloMessage,
  ObsRelayLegacyErrorMessage,
  ObsRelayLegacyResultMessage,
  ObsRelayAgentMetadata,
  ObsRelayPingMessage,
  ObsRelayPongMessage,
  ObsStatus,
  RelayStatus,
} from "../shared/types.js";
import { AGENT_VERSION, RELAY_PROTOCOL_VERSION } from "../shared/agentMetadata.js";
import { SUPPORTED_RELAY_COMMAND_NAMES } from "../shared/relayCommands.js";
import { ObsClient } from "./obsClient.js";
import {
  getBooleanPayload,
  getNumberPayload,
  getStringPayload,
  isRecord,
  parseBrowserSourceCreatePayload,
  parseBrowserSourceUpdatePayload,
  parseSceneItemIndexSetPayload,
  parseSceneItemRemovePayload,
  parseSceneItemTransformSetPayload,
  parseSceneItemVisibilitySetPayload,
  parseSourceSettingsGetPayload,
  parseTextSourceCreatePayload,
  parseTextSourceUpdatePayload,
} from "./relayPayloadParsers.js";

const RETRY_DELAY_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const OBS_RETRY_INTERVAL_MS = 5_000;

type StateListener = (state: AgentState) => void;
type LogListener = (entry: LogEntry) => void;

export class RelayClient {
  private readonly obsClient: ObsClient;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualDisconnect = true;
  private config: AgentConfig | null = null;
  private relayStatus: RelayStatus = "disconnected";
  private obsStatus: ObsStatus = "disconnected";
  private lastError: string | null = null;
  private readonly stateListeners = new Set<StateListener>();
  private readonly logListeners = new Set<LogListener>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly heartbeatDebugEnabled = process.env.OBS_AGENT_DEBUG_HEARTBEAT === "1" || process.env.OBS_AGENT_DEBUG_HEARTBEAT?.toLowerCase() === "true";

  // OBS auto-retry
  private autoRetryObs = true;
  private obsRetryTimer: NodeJS.Timeout | null = null;
  private obsRetryLogged = false;

  constructor() {
    this.obsClient = new ObsClient((level, message) => {
      this.log(level, message);
    });
  }

  private buildAgentMetadata(): ObsRelayAgentMetadata {
    const connection = this.obsClient.getConnectionMetadata();
    return {
      agentVersion: AGENT_VERSION,
      relayProtocolVersion: RELAY_PROTOCOL_VERSION,
      capabilities: [...SUPPORTED_RELAY_COMMAND_NAMES],
      obsConnected: connection.obsConnected,
      obsVersion: connection.obsVersion,
      websocketVersion: connection.websocketVersion,
    };
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  getState(): AgentState {
    return {
      relayStatus: this.relayStatus,
      obsStatus: this.obsStatus,
      lastError: this.lastError,
    };
  }

  setAutoRetryObs(enabled: boolean): void {
    this.autoRetryObs = enabled;
    if (!enabled) {
      this.stopObsRetryLoop();
    } else if (this.relayStatus === "connected" && this.obsStatus !== "connected") {
      this.startObsRetryLoop();
    }
  }

  async connect(config: AgentConfig): Promise<AgentState> {
    this.config = config;
    this.manualDisconnect = false;
    this.lastError = null;
    this.clearReconnectTimer();
    this.closeSocket();

    this.openRelaySocket();
    return this.getState();
  }

  async disconnect(): Promise<AgentState> {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.stopObsRetryLoop();
    this.closeSocket();
    await this.obsClient.disconnect();
    this.setState({ relayStatus: "disconnected", obsStatus: "disconnected", lastError: null });
    this.log("info", "Disconnected.");
    return this.getState();
  }

  async testObs(config: AgentConfig) {
    this.config = config;
    const result = await this.obsClient.test(config);
    this.setState({ obsStatus: result.ok ? "connected" : "error", lastError: result.ok ? null : result.message });
    this.log(result.ok ? "success" : "error", result.message);
    return result;
  }

  private openRelaySocket(): void {
    const config = this.config;
    if (!config) {
      this.setState({ relayStatus: "error", lastError: "Agent config is missing." });
      return;
    }

    if (!config.agentId.trim() || !config.agentToken.trim()) {
      this.setState({ relayStatus: "error", lastError: "Agent ID and Agent Token are required." });
      this.log("error", "Agent ID and Agent Token are required.");
      return;
    }

    this.setState({ relayStatus: "connecting", lastError: null });
    this.log("info", `Connecting to relay ${config.relayUrl}.`);

    try {
      const socket = new WebSocket(config.relayUrl);
      this.socket = socket;

      socket.on("open", () => {
        const hello: ObsRelayHelloMessage = {
          type: "hello",
          agentId: config.agentId,
          agentToken: config.agentToken,
          metadata: this.buildAgentMetadata(),
        };
        socket.send(JSON.stringify(hello));
      });

      socket.on("message", raw => {
        void this.handleRelayMessage(raw.toString());
      });

      socket.on("close", () => {
        this.stopHeartbeat();
        if (this.socket === socket) {
          this.socket = null;
        }

        if (this.manualDisconnect) {
          this.setState({ relayStatus: "disconnected" });
          return;
        }

        this.setState({ relayStatus: this.lastError ? "error" : "disconnected" });
        this.log("warn", `Relay disconnected. Retrying in ${RETRY_DELAY_MS / 1000} seconds.`);
        this.scheduleReconnect();
      });

      socket.on("error", error => {
        const message = error instanceof Error ? error.message : "Relay socket error.";
        this.setState({ relayStatus: "error", lastError: message });
        this.log("error", message);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open relay connection.";
      this.setState({ relayStatus: "error", lastError: message });
      this.log("error", message);
      this.scheduleReconnect();
    }
  }

  private async handleRelayMessage(rawMessage: string): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      this.setState({ lastError: "Relay sent invalid JSON." });
      this.log("warn", "Relay sent invalid JSON.");
      return;
    }

    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      this.setState({ lastError: "Relay sent a malformed message." });
      this.log("warn", "Relay sent a malformed message.");
      return;
    }

    if (parsed.type === "hello_ack") {
      if (typeof parsed.agentId !== "string") {
        this.setState({ relayStatus: "error", lastError: "Relay hello_ack is missing agentId." });
        this.log("error", "Relay hello_ack is missing agentId.");
        return;
      }

      this.setState({ relayStatus: "connected", lastError: null });
      this.startHeartbeat();
      this.log("success", `Authenticated as agent '${parsed.agentId}'.`);
      if (this.autoRetryObs) {
        this.startObsRetryLoop();
      }
      return;
    }

    if (parsed.type === "pong") {
      if (typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) {
        this.log("warn", "Relay pong is missing ts.");
        return;
      }

      if (this.heartbeatDebugEnabled) {
        this.log("info", `Heartbeat pong received (${parsed.ts}).`);
      }

      return;
    }

    if (parsed.type === "error") {
      const errorMessage = typeof parsed.error === "string" ? parsed.error : "Relay returned an error.";
      this.setState({ relayStatus: "error", lastError: errorMessage });
      this.log("error", errorMessage);
      return;
    }

    if (parsed.type === "command") {
      if (typeof parsed.requestId !== "string" || typeof parsed.command !== "string") {
        this.setState({ lastError: "Relay command is missing requestId or command." });
        this.log("warn", "Relay command is missing requestId or command.");
        return;
      }

      const commandMessage: ObsRelayCommandMessage = {
        type: "command",
        requestId: parsed.requestId,
        command: parsed.command,
        payload: isRecord(parsed.payload) ? parsed.payload : undefined,
      };
      await this.handleCommand(commandMessage);
      return;
    }

    this.log("warn", `Ignoring unsupported relay message '${parsed.type}'.`);
  }

  private async handleCommand(message: ObsRelayCommandMessage): Promise<void> {
    try {
      const data = await this.executeCommand(message);
      if (this.obsStatus !== "connected") {
        this.obsRetryLogged = false;
        this.stopObsRetryLoop();
      }
      this.setState({ obsStatus: "connected", lastError: null });
      this.sendCommandResult({
        type: "command_result",
        requestId: message.requestId,
        ok: true,
        data: data ?? {},
      });
      this.sendLegacyResult({
        type: "result",
        requestId: message.requestId,
        result: data,
      });
      this.log("success", `Handled ${message.command}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown OBS command error.";
      this.setState({ obsStatus: "error", lastError: errorMessage });
      if (this.autoRetryObs && !this.obsRetryTimer) {
        this.startObsRetryLoop();
      }
      this.sendCommandResult({
        type: "command_result",
        requestId: message.requestId,
        ok: false,
        error: errorMessage,
      });
      this.sendLegacyError({
        type: "error",
        requestId: message.requestId,
        error: errorMessage,
      });
      this.log("error", `${message.command} failed: ${errorMessage}`);
    }
  }

  private async executeCommand(message: ObsRelayCommandMessage): Promise<unknown> {
    const config = this.config;
    if (!config) {
      throw new Error("Agent config is missing.");
    }

    switch (message.command) {
      case "obs.getStatus":
        return {
          ...(await this.obsClient.getStatus(config)),
          ...this.buildAgentMetadata(),
        };
      case "obs.listScenes":
        return this.obsClient.listScenes(config);
      case "obs.listSceneItems": {
        const sceneName = getStringPayload(message.payload, "sceneName");
        return this.obsClient.listSceneItems(config, sceneName);
      }
      case "obs.scenes.list":
        return this.obsClient.listScenesForStudio(config);
      case "obs.scene.items.list": {
        const sceneName = getStringPayload(message.payload, "sceneName");
        return this.obsClient.listSceneItemsForStudio(config, sceneName);
      }
      case "obs.scene.item.transform.set": {
        const payload = parseSceneItemTransformSetPayload(message.payload);
        return this.obsClient.applySceneItemTransformForStudio(config, payload);
      }
      case "obs.scene.item.index.set": {
        const payload = parseSceneItemIndexSetPayload(message.payload);
        return this.obsClient.setSceneItemIndexForStudio(config, payload);
      }
      case "obs.scene.source.text.create": {
        const payload = parseTextSourceCreatePayload(message.payload);
        return this.obsClient.createTextSourceForStudio(config, payload);
      }
      case "obs.scene.source.text.update": {
        const payload = parseTextSourceUpdatePayload(message.payload);
        return this.obsClient.updateTextSourceForStudio(config, payload);
      }
      case "obs.scene.source.browser.create": {
        const payload = parseBrowserSourceCreatePayload(message.payload);
        return this.obsClient.createBrowserSourceForStudio(config, payload);
      }
      case "obs.scene.source.browser.update": {
        const payload = parseBrowserSourceUpdatePayload(message.payload);
        return this.obsClient.updateBrowserSourceForStudio(config, payload);
      }
      case "obs.scene.item.visibility.set": {
        const payload = parseSceneItemVisibilitySetPayload(message.payload);
        return this.obsClient.setSceneItemVisibilityForStudio(config, payload);
      }
      case "obs.scene.item.remove": {
        const payload = parseSceneItemRemovePayload(message.payload);
        return this.obsClient.removeSceneItemForStudio(config, payload);
      }
      case "obs.scene.source.settings.get": {
        const payload = parseSourceSettingsGetPayload(message.payload);
        return this.obsClient.getSourceSettingsForStudio(config, payload);
      }
      case "obs.switchScene": {
        const sceneName = getStringPayload(message.payload, "sceneName");
        await this.obsClient.switchScene(config, sceneName);
        return {};
      }
      case "obs.setSourceVisibility": {
        const sceneName = getStringPayload(message.payload, "sceneName");
        const sourceName = getStringPayload(message.payload, "sourceName");
        const visible = getBooleanPayload(message.payload, "visible");
        await this.obsClient.setSourceVisibility(config, sceneName, sourceName, visible);
        return {};
      }
      case "obs.setTextInputText": {
        const inputName = getStringPayload(message.payload, "inputName", "sourceName");
        const text = getStringPayload(message.payload, "text", undefined, true);
        await this.obsClient.setTextInputText(config, inputName, text);
        return {};
      }
      case "obs.triggerMediaInputAction": {
        const inputName = getStringPayload(message.payload, "inputName", "sourceName");
        const mediaAction = getStringPayload(message.payload, "mediaAction") as ObsMediaAction;
        await this.obsClient.triggerMediaInputAction(config, inputName, mediaAction);
        return {};
      }
      case "obs.media.show": {
        const mediaPayload: ObsRelayMediaShowPayload = {
          kind: getStringPayload(message.payload, "kind") as "image" | "gif",
          url: getStringPayload(message.payload, "url"),
          durationMs: getNumberPayload(message.payload, "durationMs"),
          title: getStringPayload(message.payload, "title"),
        };
        return this.obsClient.showMediaOverlay(config, mediaPayload);
      }
      default:
        throw new Error(`Unsupported relay command '${message.command}'.`);
    }
  }

  private sendCommandResult(message: ObsRelayCommandResultMessage): void {
    this.sendJson(message);
  }

  private sendLegacyResult(message: ObsRelayLegacyResultMessage): void {
    this.sendJson(message);
  }

  private sendLegacyError(message: ObsRelayLegacyErrorMessage): void {
    this.sendJson(message);
  }

  private sendJson(message: ObsRelayCommandResultMessage | ObsRelayLegacyResultMessage | ObsRelayLegacyErrorMessage | ObsRelayErrorMessage | ObsRelayPingMessage | ObsRelayPongMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openRelaySocket();
    }, RETRY_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeSocket(): void {
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      return;
    }

    socket.removeAllListeners();
    socket.close();
  }

  private startObsRetryLoop(): void {
    if (this.obsRetryTimer) {
      return;
    }

    const attempt = async (): Promise<void> => {
      if (this.obsStatus === "connected" || this.manualDisconnect) {
        this.stopObsRetryLoop();
        return;
      }

      const config = this.config;
      if (!config) {
        return;
      }

      if (!this.obsRetryLogged) {
        this.log("info", "Waiting for OBS...");
        this.obsRetryLogged = true;
        this.setState({ obsStatus: "waiting" });
      }

      try {
        const result = await this.obsClient.test(config);
        if (result.ok) {
          this.obsRetryLogged = false;
          this.stopObsRetryLoop();
          this.setState({ obsStatus: "connected", lastError: null });
          this.log("success", result.message);
        }
      } catch {
        // silent — will retry
      }
    };

    void attempt();
    this.obsRetryTimer = setInterval(() => { void attempt(); }, OBS_RETRY_INTERVAL_MS);
  }

  private stopObsRetryLoop(): void {
    if (!this.obsRetryTimer) {
      return;
    }

    clearInterval(this.obsRetryTimer);
    this.obsRetryTimer = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      const message: ObsRelayPingMessage = {
        type: "ping",
        ts: Date.now(),
        metadata: this.buildAgentMetadata(),
      };

      this.sendJson(message);
      if (this.heartbeatDebugEnabled) {
        this.log("info", `Heartbeat ping sent (${message.ts}).`);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private setState(partial: Partial<AgentState>): void {
    if (partial.relayStatus) {
      this.relayStatus = partial.relayStatus;
    }
    if (partial.obsStatus) {
      this.obsStatus = partial.obsStatus;
    }
    if (Object.prototype.hasOwnProperty.call(partial, "lastError")) {
      this.lastError = partial.lastError ?? null;
    }

    const state = this.getState();
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private log(level: LogEntry["level"], message: string): void {
    const sanitized = this.sanitizeLogMessage(message);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitized,
    };

    for (const listener of this.logListeners) {
      listener(entry);
    }
  }

  private sanitizeLogMessage(message: string): string {
    const token = this.config?.agentToken.trim();
    if (!token) {
      return message;
    }

    return message.split(token).join("[redacted]");
  }
}
