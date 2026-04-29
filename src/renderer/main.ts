import "./styles.css";
import { AgentConfig, AgentSettings, AgentState, DEFAULT_CONFIG, DEFAULT_SETTINGS, LogEntry, UpdateState } from "../shared/types";
import { CHANGELOG } from "../shared/changelog";
import { t, setLanguage, getLanguage } from "./i18n";

// ============================================================================
// DOM Elements - Tabs
// ============================================================================

const tabMain = document.querySelector<HTMLButtonElement>("#tab-main");
const tabSettings = document.querySelector<HTMLButtonElement>("#tab-settings");
const tabChangelog = document.querySelector<HTMLButtonElement>("#tab-changelog");

const panelMain = document.querySelector<HTMLElement>("#panel-main");
const panelSettings = document.querySelector<HTMLElement>("#panel-settings");
const panelChangelog = document.querySelector<HTMLElement>("#panel-changelog");

// ============================================================================
// DOM Elements - Main Tab
// ============================================================================

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
const relayStatus = document.querySelector<HTMLElement>("#relay-status");
const obsStatus = document.querySelector<HTMLElement>("#obs-status");
const lastError = document.querySelector<HTMLElement>("#last-error");
const clearLogButton = document.querySelector<HTMLButtonElement>("#clear-log-button");
const logList = document.querySelector<HTMLOListElement>("#log-list");

// ============================================================================
// DOM Elements - Settings Tab
// ============================================================================

const startWithWindowsCheck = document.querySelector<HTMLInputElement>("#start-with-windows");
const startMinimizedCheck = document.querySelector<HTMLInputElement>("#start-minimized");
const autoConnectCheck = document.querySelector<HTMLInputElement>("#auto-connect");
const autoRetryObsCheck = document.querySelector<HTMLInputElement>("#auto-retry-obs");
const languageSelect = document.querySelector<HTMLSelectElement>("#language-select");
const checkUpdatesButton = document.querySelector<HTMLButtonElement>("#check-updates-button");
const installUpdateButton = document.querySelector<HTMLButtonElement>("#install-update-button");
const updateStatus = document.querySelector<HTMLElement>("#update-status");
const currentVersion = document.querySelector<HTMLElement>("#current-version");

// ============================================================================
// DOM Elements - Header
// ============================================================================

const relayPill = document.querySelector<HTMLElement>("#relay-pill");
const obsPill = document.querySelector<HTMLElement>("#obs-pill");
const relayPillStatus = document.querySelector<HTMLElement>("#relay-pill-status");
const obsPillStatus = document.querySelector<HTMLElement>("#obs-pill-status");

// ============================================================================
// DOM Elements - Changelog
// ============================================================================

const changelogList = document.querySelector<HTMLElement>("#changelog-list");

// ============================================================================
// Validation
// ============================================================================

const requiredElements = [
  tabMain,
  tabSettings,
  tabChangelog,
  panelMain,
  panelSettings,
  panelChangelog,
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
  relayStatus,
  obsStatus,
  lastError,
  clearLogButton,
  logList,
  startWithWindowsCheck,
  startMinimizedCheck,
  autoConnectCheck,
  autoRetryObsCheck,
  languageSelect,
  checkUpdatesButton,
  installUpdateButton,
  updateStatus,
  currentVersion,
  relayPill,
  obsPill,
  changelogList,
];

if (requiredElements.some(element => !element)) {
  throw new Error("Balkon OBS Agent UI failed to initialize.");
}

// ============================================================================
// UI State
// ============================================================================

let currentTab: "main" | "settings" | "changelog" = "main";

// ============================================================================
// Tab Management
// ============================================================================

function switchTab(tab: "main" | "settings" | "changelog"): void {
  if (currentTab === tab) return;

  const tabs = [
    { tab: "main", button: tabMain!, panel: panelMain! },
    { tab: "settings", button: tabSettings!, panel: panelSettings! },
    { tab: "changelog", button: tabChangelog!, panel: panelChangelog! },
  ];

  for (const t of tabs) {
    t.button.classList.toggle("active", t.tab === tab);
    t.button.setAttribute("aria-selected", t.tab === tab ? "true" : "false");
    t.panel.classList.toggle("active", t.tab === tab);
  }

  currentTab = tab;
}

// ============================================================================
// Tab Event Listeners
// ============================================================================

tabMain!.addEventListener("click", () => switchTab("main"));
tabSettings!.addEventListener("click", () => switchTab("settings"));
tabChangelog!.addEventListener("click", () => switchTab("changelog"));

// ============================================================================
// Form Helpers
// ============================================================================

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
    language: (languageSelect!.value as "en" | "ru" | "et") || DEFAULT_SETTINGS.language,
  };
}

function writeSettings(settings: AgentSettings): void {
  startWithWindowsCheck!.checked = settings.startWithWindows;
  startMinimizedCheck!.checked = settings.startMinimizedToTray;
  autoConnectCheck!.checked = settings.autoConnectOnLaunch;
  autoRetryObsCheck!.checked = settings.autoRetryObs;
  languageSelect!.value = settings.language;
}

function setBusy(isBusy: boolean): void {
  saveButton!.disabled = isBusy;
  connectButton!.disabled = isBusy;
  disconnectButton!.disabled = isBusy;
  testObsButton!.disabled = isBusy;
}

// ============================================================================
// Localization Helpers
// ============================================================================

function updateTranslations(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });
}

function applyLanguage(lang: "en" | "ru" | "et"): void {
  setLanguage(lang);
  updateTranslations();
}

// ============================================================================
// Render Functions
// ============================================================================

function renderState(state: AgentState): void {
  relayStatus!.textContent = state.relayStatus;
  obsStatus!.textContent = state.obsStatus;
  lastError!.textContent = state.lastError || t("error_none");

  relayPillStatus!.textContent = state.relayStatus;
  obsPillStatus!.textContent = state.obsStatus;
  relayPill!.dataset.status = state.relayStatus;
  obsPill!.dataset.status = state.obsStatus;
}

function renderUpdateState(state: UpdateState): void {
  currentVersion!.textContent = state.currentVersion;
  updateStatus!.textContent = state.message;
  const statusDisplay = updateStatus!.parentElement;
  if (statusDisplay) {
    statusDisplay.dataset.status = state.status;
  }
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

function renderChangelog(): void {
  changelogList!.replaceChildren();
  for (const entry of CHANGELOG) {
    const versionDiv = document.createElement("div");
    versionDiv.className = "changelog-entry";

    const versionTitle = document.createElement("h3");
    versionTitle.className = "changelog-version";
    versionTitle.textContent = `v${entry.version}`;

    const changesList = document.createElement("ul");
    changesList.className = "changelog-changes";

    for (const change of entry.changes) {
      const li = document.createElement("li");
      li.textContent = change;
      changesList.appendChild(li);
    }

    versionDiv.append(versionTitle, changesList);
    changelogList!.appendChild(versionDiv);
  }
}

// ============================================================================
// Form Events
// ============================================================================

async function saveConfig(): Promise<void> {
  const saved = await window.balkonAgent.saveConfig(readForm());
  writeForm(saved);
  addLog({
    timestamp: new Date().toISOString(),
    level: "success",
    message: "Configuration saved.",
  });
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
    window.balkonAgent.saveSettings(readSettings()).catch(() => {
      // Non-critical, ignore
    });
  });
}

languageSelect!.addEventListener("change", () => {
  const settings = readSettings();
  applyLanguage(settings.language);
  window.balkonAgent.saveSettings(settings).catch(() => {
    // Non-critical, ignore
  });
});

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
      if (updateStatus!.parentElement?.dataset.status !== "checking" && updateStatus!.parentElement?.dataset.status !== "downloading") {
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

// ============================================================================
// Tray Actions
// ============================================================================

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

// ============================================================================
// State Subscriptions
// ============================================================================

window.balkonAgent.onStateChange(renderState);
window.balkonAgent.onLog(addLog);
window.balkonAgent.onUpdateState(renderUpdateState);

// ============================================================================
// Initialization
// ============================================================================

async function initializeApp(): Promise<void> {
  // Load config
  try {
    const config = await window.balkonAgent.loadConfig();
    writeForm(config);
  } catch {
    writeForm(DEFAULT_CONFIG);
  }

  // Load settings and apply language
  try {
    const settings = await window.balkonAgent.loadSettings();
    writeSettings(settings);
    applyLanguage(settings.language);
  } catch {
    writeSettings(DEFAULT_SETTINGS);
    applyLanguage(DEFAULT_SETTINGS.language);
  }

  // Render changelog
  renderChangelog();

  // Apply initial translations
  updateTranslations();
}

initializeApp().catch(error => {
  console.error("Failed to initialize app:", error);
  writeForm(DEFAULT_CONFIG);
  writeSettings(DEFAULT_SETTINGS);
  applyLanguage(DEFAULT_SETTINGS.language);
});
