import "./styles.css";
import { AgentConfig, AgentSettings, AgentState, DEFAULT_CONFIG, DEFAULT_SETTINGS, LogEntry, UpdateState } from "../shared/types";

const form = document.querySelector<HTMLFormElement>("#config-form");
const relayUrlInput = document.querySelector<HTMLInputElement>("#relay-url");
const agentIdInput = document.querySelector<HTMLInputElement>("#agent-id");
const agentTokenInput = document.querySelector<HTMLInputElement>("#agent-token");
const obsUrlInput = document.querySelector<HTMLInputElement>("#obs-url");
const obsPasswordInput = document.querySelector<HTMLInputElement>("#obs-password");
const saveButton = document.querySelector<HTMLButtonElement>("#save-button");
const connectButton = document.querySelector<HTMLButtonElement>("#connect-button");
const disconnectButton = document.querySelector<HTMLButtonElement>("#disconnect-button");
const testObsButton = document.querySelector<HTMLButtonElement>("#test-obs-button");
const checkUpdatesButton = document.querySelector<HTMLButtonElement>("#check-updates-button");
const installUpdateButton = document.querySelector<HTMLButtonElement>("#install-update-button");
const clearLogButton = document.querySelector<HTMLButtonElement>("#clear-log-button");
const relayStatus = document.querySelector<HTMLElement>("#relay-status");
const obsStatus = document.querySelector<HTMLElement>("#obs-status");
const lastError = document.querySelector<HTMLElement>("#last-error");
const titleVersion = document.querySelector<HTMLElement>("#title-version");
const currentVersion = document.querySelector<HTMLElement>("#current-version");
const updateStatus = document.querySelector<HTMLElement>("#update-status");
const relayPill = document.querySelector<HTMLElement>("#relay-pill");
const obsPill = document.querySelector<HTMLElement>("#obs-pill");
const logList = document.querySelector<HTMLOListElement>("#log-list");

// Behavior settings checkboxes
const startWithWindowsCheck = document.querySelector<HTMLInputElement>("#start-with-windows");
const startMinimizedCheck = document.querySelector<HTMLInputElement>("#start-minimized");
const autoConnectCheck = document.querySelector<HTMLInputElement>("#auto-connect");
const autoRetryObsCheck = document.querySelector<HTMLInputElement>("#auto-retry-obs");

const requiredElements = [
  form,
  relayUrlInput,
  agentIdInput,
  agentTokenInput,
  obsUrlInput,
  obsPasswordInput,
  saveButton,
  connectButton,
  disconnectButton,
  testObsButton,
  checkUpdatesButton,
  installUpdateButton,
  clearLogButton,
  relayStatus,
  obsStatus,
  lastError,
  titleVersion,
  currentVersion,
  updateStatus,
  relayPill,
  obsPill,
  logList,
  startWithWindowsCheck,
  startMinimizedCheck,
  autoConnectCheck,
  autoRetryObsCheck,
];

if (requiredElements.some(element => !element)) {
  throw new Error("Balkon OBS Agent UI failed to initialize.");
}

function readForm(): AgentConfig {
  return {
    relayUrl: relayUrlInput!.value.trim() || DEFAULT_CONFIG.relayUrl,
    agentId: agentIdInput!.value.trim(),
    agentToken: agentTokenInput!.value.trim(),
    obsUrl: obsUrlInput!.value.trim() || DEFAULT_CONFIG.obsUrl,
    obsPassword: obsPasswordInput!.value,
  };
}

function writeForm(config: AgentConfig): void {
  relayUrlInput!.value = config.relayUrl;
  agentIdInput!.value = config.agentId;
  agentTokenInput!.value = config.agentToken;
  obsUrlInput!.value = config.obsUrl;
  obsPasswordInput!.value = config.obsPassword;
}

function readSettings(): AgentSettings {
  return {
    startWithWindows: startWithWindowsCheck!.checked,
    startMinimizedToTray: startMinimizedCheck!.checked,
    autoConnectOnLaunch: autoConnectCheck!.checked,
    autoRetryObs: autoRetryObsCheck!.checked,
  };
}

function writeSettings(settings: AgentSettings): void {
  startWithWindowsCheck!.checked = settings.startWithWindows;
  startMinimizedCheck!.checked = settings.startMinimizedToTray;
  autoConnectCheck!.checked = settings.autoConnectOnLaunch;
  autoRetryObsCheck!.checked = settings.autoRetryObs;
}

function setBusy(isBusy: boolean): void {
  saveButton!.disabled = isBusy;
  connectButton!.disabled = isBusy;
  disconnectButton!.disabled = isBusy;
  testObsButton!.disabled = isBusy;
}

function renderState(state: AgentState): void {
  relayStatus!.textContent = state.relayStatus;
  obsStatus!.textContent = state.obsStatus;
  lastError!.textContent = state.lastError || "None";

  relayPill!.textContent = `Relay ${state.relayStatus}`;
  relayPill!.dataset.status = state.relayStatus;
  obsPill!.textContent = `OBS ${state.obsStatus}`;
  obsPill!.dataset.status = state.obsStatus;
}

function renderUpdateState(state: UpdateState): void {
  titleVersion!.textContent = `v${state.currentVersion}`;
  currentVersion!.textContent = state.currentVersion;
  updateStatus!.textContent = state.message;
  updateStatus!.dataset.status = state.status;
  installUpdateButton!.hidden = state.status !== "downloaded";
  checkUpdatesButton!.disabled = state.status === "checking" || state.status === "downloading" || state.status === "disabled";
}

function addLog(entry: LogEntry): void {
  const item = document.createElement("li");
  item.className = `log-entry log-${entry.level}`;

  const time = document.createElement("time");
  time.dateTime = entry.timestamp;
  time.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(entry.timestamp));

  const message = document.createElement("span");
  message.textContent = entry.message;

  item.append(time, message);
  logList!.prepend(item);

  while (logList!.children.length > 80) {
    logList!.lastElementChild?.remove();
  }
}

async function saveConfig(): Promise<void> {
  const saved = await window.balkonAgent.saveConfig(readForm());
  writeForm(saved);
  addLog({
    timestamp: new Date().toISOString(),
    level: "success",
    message: "Configuration saved.",
  });
}

async function saveSettings(): Promise<void> {
  await window.balkonAgent.saveSettings(readSettings());
}

form!.addEventListener("submit", event => {
  event.preventDefault();
  setBusy(true);
  saveConfig()
    .catch(error => {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: error instanceof Error ? error.message : "Failed to save configuration.",
      });
    })
    .finally(() => setBusy(false));
});

for (const checkbox of [startWithWindowsCheck!, startMinimizedCheck!, autoConnectCheck!, autoRetryObsCheck!]) {
  checkbox.addEventListener("change", () => {
    saveSettings().catch(() => {
      // Non-critical, ignore
    });
  });
}

connectButton!.addEventListener("click", () => {
  setBusy(true);
  window.balkonAgent.connect(readForm())
    .then(renderState)
    .catch(error => {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: error instanceof Error ? error.message : "Failed to connect.",
      });
    })
    .finally(() => setBusy(false));
});

disconnectButton!.addEventListener("click", () => {
  setBusy(true);
  window.balkonAgent.disconnect()
    .then(renderState)
    .catch(error => {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: error instanceof Error ? error.message : "Failed to disconnect.",
      });
    })
    .finally(() => setBusy(false));
});

testObsButton!.addEventListener("click", () => {
  setBusy(true);
  window.balkonAgent.testObs(readForm())
    .then(result => {
      addLog({
        timestamp: new Date().toISOString(),
        level: result.ok ? "success" : "error",
        message: result.message,
      });
    })
    .catch(error => {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: error instanceof Error ? error.message : "OBS test failed.",
      });
    })
    .finally(() => setBusy(false));
});

clearLogButton!.addEventListener("click", () => {
  logList!.replaceChildren();
});

checkUpdatesButton!.addEventListener("click", () => {
  checkUpdatesButton!.disabled = true;
  window.balkonAgent.checkForUpdates()
    .then(renderUpdateState)
    .catch(error => {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: error instanceof Error ? error.message : "Failed to check for updates.",
      });
    })
    .finally(() => {
      if (updateStatus!.dataset.status !== "checking" && updateStatus!.dataset.status !== "downloading") {
        checkUpdatesButton!.disabled = false;
      }
    });
});

installUpdateButton!.addEventListener("click", () => {
  installUpdateButton!.disabled = true;
  window.balkonAgent.installUpdate()
    .then(renderUpdateState)
    .catch(error => {
      installUpdateButton!.disabled = false;
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: error instanceof Error ? error.message : "Failed to install update.",
      });
    });
});

// Tray actions forwarded from main process (connect/disconnect triggered from tray menu)
window.balkonAgent.onTrayAction(action => {
  if (action === "connect") {
    window.balkonAgent.connect(readForm())
      .then(renderState)
      .catch(() => { /* silent */ });
  } else if (action === "disconnect") {
    window.balkonAgent.disconnect()
      .then(renderState)
      .catch(() => { /* silent */ });
  }
});

window.balkonAgent.onStateChange(renderState);
window.balkonAgent.onLog(addLog);
window.balkonAgent.onUpdateState(renderUpdateState);

window.balkonAgent.loadConfig()
  .then(writeForm)
  .catch(() => writeForm(DEFAULT_CONFIG));

window.balkonAgent.loadSettings()
  .then(writeSettings)
  .catch(() => writeSettings(DEFAULT_SETTINGS));
