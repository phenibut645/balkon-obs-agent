export type LanguageCode = "en" | "ru" | "et";

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    // App title
    app_title: "Balkon OBS Agent",
    app_version: "Version",

    // Relay and OBS status
    relay_connected: "Relay connected",
    relay_disconnected: "Relay disconnected",
    relay_connecting: "Relay connecting",
    relay_error: "Relay error",
    obs_connected: "OBS connected",
    obs_disconnected: "OBS disconnected",
    obs_waiting: "OBS waiting",
    obs_error: "OBS error",
    last_error: "Last error",
    error_none: "None",

    // Tabs
    tab_main: "Main",
    tab_capabilities: "Relay Methods",
    tab_settings: "Settings",
    tab_changelog: "Changelog",
    capabilities_heading: "Relay Methods",
    capabilities_description: "This agent build supports the following OBS relay commands.",

    // Main tab labels
    relay_url: "Relay URL",
    agent_id: "Agent ID",
    agent_token: "Agent Token",
    obs_url: "OBS WebSocket URL",
    obs_password: "OBS WebSocket Password",
    save: "Save",
    connect: "Connect",
    disconnect: "Disconnect",
    test_obs: "Test OBS",
    recent_events: "Recent Events",
    clear: "Clear",

    // Settings tab - Behavior
    behavior: "Behavior",
    start_with_windows: "Start with Windows",
    start_minimized: "Start minimized to tray",
    auto_connect: "Auto-connect on launch",
    auto_retry_obs: "Auto-retry OBS connection",

    // Settings tab - Language
    language: "Language",
    language_en: "English",
    language_ru: "Русский",
    language_et: "Eesti",

    // Settings tab - Updates
    updates: "Updates",
    check_updates: "Check Updates",
    restart_to_update: "Restart to Update",
    update_current: "Current version",
    update_status: "Update status",

    // Settings tab - Info
    tray_info: "Closing the window keeps the app running in the system tray.",

    // Changelog tab
    changelog: "Changelog",
    latest_changes: "Latest changes",

    // Status pills
    relay_status: "Relay",
    obs_status: "OBS",

    // Buttons
    clear_log: "Clear",
  },
  ru: {
    // App title
    app_title: "Балкон OBS Агент",
    app_version: "Версия",

    // Relay and OBS status
    relay_connected: "Релей подключен",
    relay_disconnected: "Релей отключен",
    relay_connecting: "Релей подключается",
    relay_error: "Ошибка релея",
    obs_connected: "OBS подключена",
    obs_disconnected: "OBS отключена",
    obs_waiting: "Ожидание OBS",
    obs_error: "Ошибка OBS",
    last_error: "Последняя ошибка",
    error_none: "Нет",

    // Tabs
    tab_main: "Основное",
    tab_capabilities: "Возможности",
    tab_settings: "Настройки",
    tab_changelog: "История",
    capabilities_heading: "Возможности",
    capabilities_description: "Этот агент поддерживает следующие команды OBS релея.",

    // Main tab labels
    relay_url: "URL релея",
    agent_id: "ID агента",
    agent_token: "Токен агента",
    obs_url: "URL OBS WebSocket",
    obs_password: "Пароль OBS WebSocket",
    save: "Сохранить",
    connect: "Подключить",
    disconnect: "Отключить",
    test_obs: "Тест OBS",
    recent_events: "Последние события",
    clear: "Очистить",

    // Settings tab - Behavior
    behavior: "Поведение",
    start_with_windows: "Запускаться вместе с Windows",
    start_minimized: "Запускаться свернутым в трей",
    auto_connect: "Автоподключение при запуске",
    auto_retry_obs: "Повторная попытка подключения к OBS",

    // Settings tab - Language
    language: "Язык",
    language_en: "English",
    language_ru: "Русский",
    language_et: "Eesti",

    // Settings tab - Updates
    updates: "Обновления",
    check_updates: "Проверить обновления",
    restart_to_update: "Перезагрузить для обновления",
    update_current: "Текущая версия",
    update_status: "Статус обновления",

    // Settings tab - Info
    tray_info: "При закрытии окна приложение продолжает работать в системном трее.",

    // Changelog tab
    changelog: "История",
    latest_changes: "Последние изменения",

    // Status pills
    relay_status: "Релей",
    obs_status: "OBS",

    // Buttons
    clear_log: "Очистить",
  },
  et: {
    // App title
    app_title: "Balkon OBS Agent",
    app_version: "Versioon",

    // Relay and OBS status
    relay_connected: "Relei ühendatud",
    relay_disconnected: "Relei lahti ühendatud",
    relay_connecting: "Relei ühendab",
    relay_error: "Relei viga",
    obs_connected: "OBS ühendatud",
    obs_disconnected: "OBS lahti ühendatud",
    obs_waiting: "OBS ootel",
    obs_error: "OBS viga",
    last_error: "Viimane viga",
    error_none: "Puudub",

    // Tabs
    tab_main: "Peamine",
    tab_capabilities: "Võimekused",
    tab_settings: "Seadistused",
    tab_changelog: "Muudatused",
    capabilities_heading: "Võimekused",
    capabilities_description: "See agent toetab järgmisi OBS relee käske.",

    // Main tab labels
    relay_url: "Relei URL",
    agent_id: "Agendi ID",
    agent_token: "Agendi märk",
    obs_url: "OBS WebSocket URL",
    obs_password: "OBS WebSocket parool",
    save: "Salvestada",
    connect: "Ühendada",
    disconnect: "Lahti ühendada",
    test_obs: "OBS test",
    recent_events: "Hiljutised sündmused",
    clear: "Kustutada",

    // Settings tab - Behavior
    behavior: "Käitumine",
    start_with_windows: "Käivitada koos Windowsiga",
    start_minimized: "Käivitada salvestatud salvestamata",
    auto_connect: "Automaatne ühendamine käivitamisel",
    auto_retry_obs: "Automaatne uuesti proovimise OBS ühendus",

    // Settings tab - Language
    language: "Keel",
    language_en: "English",
    language_ru: "Русский",
    language_et: "Eesti",

    // Settings tab - Updates
    updates: "Uuendused",
    check_updates: "Kontrollida uuendusi",
    restart_to_update: "Taaskäivitage värskendamiseks",
    update_current: "Praegune versioon",
    update_status: "Uuendamise olek",

    // Settings tab - Info
    tray_info: "Akna sulgemisel jätkab rakendus töötamist süsteemi salves.",

    // Changelog tab
    changelog: "Muudatused",
    latest_changes: "Viimased muudatused",

    // Status pills
    relay_status: "Relei",
    obs_status: "OBS",

    // Buttons
    clear_log: "Kustutada",
  },
};

let currentLanguage: LanguageCode = "en";

export function setLanguage(lang: LanguageCode): void {
  if (translations[lang]) {
    currentLanguage = lang;
  }
}

export function getLanguage(): LanguageCode {
  return currentLanguage;
}

export function t(key: string): string {
  const text = translations[currentLanguage]?.[key];
  if (!text) {
    console.warn(`Translation missing: ${key} for language ${currentLanguage}`);
    return key;
  }
  return text;
}
