const STORAGE_KEYS = {
  siteProfiles: "siteProfiles",
  restoreSnapshot: "restoreSnapshot",
  pinnedExtensionIds: "pinnedExtensionIds",
  benchmarkLabels: "benchmarkLabels",
  manifestSignals: "manifestSignals"
};

const SITE_RELEVANCE_HEURISTICS = [
  {
    hosts: ["youtube.com", "youtu.be"],
    keywords: ["youtube", "yt", "video"]
  },
  {
    hosts: ["docs.google.com"],
    keywords: ["google docs", "docs", "document", "writer"]
  },
  {
    hosts: ["mail.google.com"],
    keywords: ["gmail", "mail", "inbox"]
  },
  {
    hosts: ["drive.google.com"],
    keywords: ["google drive", "drive", "storage"]
  },
  {
    hosts: ["github.com"],
    keywords: ["github", "git", "pull request", "repository", "repo"]
  }
];

const BROWSER_WIDE_PERMISSION_HINTS = [
  "declarativeNetRequest",
  "declarativeNetRequestFeedback",
  "declarativeNetRequestWithHostAccess",
  "proxy",
  "contentSettings",
  "privacy",
  "webRequest",
  "webRequestBlocking"
];

const TAB_LEVEL_PERMISSION_HINTS = [
  "activeTab",
  "scripting",
  "tabs",
  "webNavigation"
];

const state = {
  tab: null,
  origin: null,
  selfId: null,
  extensions: [],
  currentSiteProfile: null,
  storage: {
    siteProfiles: {},
    restoreSnapshot: null,
    pinnedExtensionIds: [],
    benchmarkLabels: {},
    manifestSignals: {}
  }
};

const testTabOverride = readTestTabOverride();
const testManagementFixtureName = readTestManagementFixtureName();
let testManagementState = null;

const TEST_MANAGEMENT_FIXTURES = {
  protected: {
    extensions: [
      {
        id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        name: "ProtectedTube Helper",
        shortName: "ProtectedTube",
        version: "1.0.0",
        description: "Protected helper for YouTube pages.",
        enabled: true,
        mayDisable: false,
        mayEnable: true,
        type: "extension",
        hostPermissions: ["https://www.youtube.com/*"],
        permissions: ["activeTab"],
        homepageUrl: "https://www.youtube.com"
      },
      {
        id: "cccccccccccccccccccccccccccccccc",
        name: "LockedOffTube Helper",
        shortName: "LockedOffTube",
        version: "1.0.0",
        description: "Unavailable helper for YouTube pages.",
        enabled: false,
        mayDisable: true,
        mayEnable: false,
        type: "extension",
        hostPermissions: ["https://www.youtube.com/*"],
        permissions: ["activeTab"],
        homepageUrl: "https://www.youtube.com"
      },
      {
        id: "dddddddddddddddddddddddddddddddd",
        name: "ProtectedDocs Helper",
        shortName: "ProtectedDocs",
        version: "1.0.0",
        description: "Protected helper for Google Docs pages.",
        enabled: true,
        mayDisable: false,
        mayEnable: true,
        type: "extension",
        hostPermissions: ["https://docs.google.com/*"],
        permissions: ["activeTab"],
        homepageUrl: "https://docs.google.com"
      },
      {
        id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        name: "ToggleableDocs Helper",
        shortName: "ToggleableDocs",
        version: "1.0.0",
        description: "Normal helper for Google Docs pages.",
        enabled: true,
        mayDisable: true,
        mayEnable: true,
        type: "extension",
        hostPermissions: ["https://docs.google.com/*"],
        permissions: ["activeTab"],
        homepageUrl: "https://docs.google.com"
      }
    ]
  }
};

const ui = {
  tabTitle: document.getElementById("tab-title"),
  tabOrigin: document.getElementById("tab-origin"),
  metricInstalled: document.getElementById("metric-installed"),
  metricEnabled: document.getElementById("metric-enabled"),
  metricRelevant: document.getElementById("metric-relevant"),
  list: document.getElementById("extension-list"),
  status: document.getElementById("status"),
  actionScopeNote: document.getElementById("action-scope-note"),
  template: document.getElementById("extension-row-template"),
  lightenButton: document.getElementById("lighten-site"),
  restoreButton: document.getElementById("restore-state"),
  saveButton: document.getElementById("save-setup"),
  siteProfileSummary: document.getElementById("site-profile-summary"),
  applySavedSetupButton: document.getElementById("apply-saved-setup"),
  clearSavedSetupButton: document.getElementById("clear-saved-setup"),
  benchmarkSummary: document.getElementById("benchmark-summary"),
  importBenchmarksButton: document.getElementById("import-benchmarks"),
  resetBenchmarksButton: document.getElementById("reset-benchmarks"),
  benchmarkFileInput: document.getElementById("benchmark-file-input")
};

init().catch((error) => {
  setStatus(error.message || String(error), true);
});

async function init() {
  await ensureDefaultState();
  bindEvents();
  await refresh();
}

async function ensureDefaultState() {
  const response = await chrome.runtime.sendMessage({ type: "ems.ensure-default-state" });
  if (response && response.ok === false) {
    throw new Error(response.error || "Failed to initialize EMS state.");
  }
}

function bindEvents() {
  ui.lightenButton.addEventListener("click", () => runWithStatus("Lightening site...", async () => {
    await saveRestoreSnapshot();
    const change = await lightenCurrentSite();
    await refresh();
    setStatus(buildLightenStatus(change));
  }));

  ui.restoreButton.addEventListener("click", () => runWithStatus("Restoring previous state...", async () => {
    const change = await restorePreviousState();
    await refresh();
    setStatus(buildRestoreStatus(change));
  }));

  ui.saveButton.addEventListener("click", () => runWithStatus("Saving site setup...", async () => {
    const result = await saveCurrentSetupForSite();
    await refresh();
    setStatus(buildSaveStatus(result));
  }));

  ui.applySavedSetupButton.addEventListener("click", () => runWithStatus("Applying saved site setup...", async () => {
    await saveRestoreSnapshot();
    const change = await applySavedSetupForSite();
    await refresh();
    setStatus(buildApplySavedStatus(change));
  }));

  ui.clearSavedSetupButton.addEventListener("click", () => runWithStatus("Clearing saved site setup...", async () => {
    await clearSavedSetupForSite();
    await refresh();
    setStatus(`Cleared the saved setup for ${state.origin || "this site"}. No browser-wide extension state changed.`);
  }));

  ui.importBenchmarksButton.addEventListener("click", () => {
    ui.benchmarkFileInput.value = "";
    ui.benchmarkFileInput.click();
  });

  ui.resetBenchmarksButton.addEventListener("click", () => runWithStatus("Resetting probe data...", async () => {
    const defaults = await getDefaultBenchmarkLabels();
    await chrome.storage.local.set({
      [STORAGE_KEYS.benchmarkLabels]: defaults,
      [STORAGE_KEYS.manifestSignals]: {}
    });
    await refresh();
    setStatus("Reset benchmark labels to the seeded defaults. Cleared imported manifest signals.");
  }));

  ui.benchmarkFileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await runWithStatus("Importing probe data...", async () => {
      const importedData = await importProbeDataFile(file);
      const benchmarkCount = Object.keys(importedData.benchmarkLabels).length;
      const signalCount = Object.keys(importedData.manifestSignals).length;
      const storageUpdate = {};

      if (benchmarkCount > 0) {
        storageUpdate[STORAGE_KEYS.benchmarkLabels] = {
          ...state.storage.benchmarkLabels,
          ...importedData.benchmarkLabels
        };
      }
      if (signalCount > 0) {
        storageUpdate[STORAGE_KEYS.manifestSignals] = {
          ...state.storage.manifestSignals,
          ...importedData.manifestSignals
        };
      }

      await chrome.storage.local.set(storageUpdate);
      await refresh();
      setStatus(buildImportProbeDataStatus(file.name, benchmarkCount, signalCount));
    });
  });
}

async function refresh() {
  const tab = await resolveCurrentTab();
  if (!tab || !tab.url) {
    throw new Error("No active tab URL is available.");
  }

  const self = await chrome.management.getSelf();
  const storage = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const allExtensions = await resolveAllExtensions();

  state.tab = tab;
  state.origin = safeOrigin(tab.url);
  state.selfId = self.id;
  state.storage = {
    siteProfiles: storage[STORAGE_KEYS.siteProfiles] ?? {},
    restoreSnapshot: storage[STORAGE_KEYS.restoreSnapshot] ?? null,
    pinnedExtensionIds: storage[STORAGE_KEYS.pinnedExtensionIds] ?? [],
    benchmarkLabels: storage[STORAGE_KEYS.benchmarkLabels] ?? {},
    manifestSignals: storage[STORAGE_KEYS.manifestSignals] ?? {}
  };
  state.currentSiteProfile = state.origin ? state.storage.siteProfiles[state.origin] ?? null : null;
  state.extensions = allExtensions
    .filter((extension) => extension.type === "extension" && extension.id !== state.selfId)
    .map((extension) => decorateExtension(extension))
    .sort(compareExtensions);

  render();
}

function readTestTabOverride() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("emsTestUrl");
  if (!url) {
    return null;
  }

  return {
    id: -1,
    title: params.get("emsTestTitle") || "EMS Test Tab",
    url
  };
}

function readTestManagementFixtureName() {
  const params = new URLSearchParams(window.location.search);
  return params.get("emsTestManagementFixture");
}

async function resolveCurrentTab() {
  if (testTabOverride) {
    return testTabOverride;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function resolveAllExtensions() {
  const fixtureState = getTestManagementState();
  if (fixtureState) {
    return cloneFixtureValue(fixtureState.extensions);
  }
  return chrome.management.getAll();
}

async function setExtensionEnabled(extensionId, enabled) {
  const fixtureState = getTestManagementState();
  if (!fixtureState) {
    await chrome.management.setEnabled(extensionId, enabled);
    return;
  }

  const extension = fixtureState.extensions.find((candidate) => candidate.id === extensionId);
  if (!extension) {
    throw new Error(`Unknown test extension: ${extensionId}`);
  }
  if (!enabled && extension.mayDisable === false) {
    throw new Error(`Fixture does not allow disabling ${extension.name}.`);
  }
  if (enabled && extension.mayEnable === false) {
    throw new Error(`Fixture does not allow enabling ${extension.name}.`);
  }
  extension.enabled = enabled;
}

function getTestManagementState() {
  if (!testManagementFixtureName) {
    return null;
  }
  if (!TEST_MANAGEMENT_FIXTURES[testManagementFixtureName]) {
    throw new Error(`Unknown EMS test management fixture: ${testManagementFixtureName}`);
  }
  if (!testManagementState) {
    testManagementState = cloneFixtureValue(TEST_MANAGEMENT_FIXTURES[testManagementFixtureName]);
  }
  return testManagementState;
}

function cloneFixtureValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function decorateExtension(extension) {
  const siteProfile = state.origin ? state.storage.siteProfiles[state.origin] : null;
  const pinned = state.storage.pinnedExtensionIds.includes(extension.id);
  const savedForSite = Boolean(siteProfile?.allowedExtensionIds?.includes(extension.id));
  const manifestSignals = state.storage.manifestSignals[extension.id] ?? null;
  const relevance = inferRelevance(extension, pinned, savedForSite, manifestSignals);
  const benchmark = state.storage.benchmarkLabels[extension.id] ?? null;

  return {
    ...extension,
    pinned,
    savedForSite,
    relevance,
    benchmark,
    manifestSignals
  };
}

function inferRelevance(extension, pinned, savedForSite, manifestSignals) {
  const hostPermissions = extension.hostPermissions ?? [];
  const permissions = extension.permissions ?? [];
  const profileHostPermissions = manifestSignals?.hostPermissions ?? [];
  const optionalHostPermissions = manifestSignals?.optionalHostPermissions ?? [];
  const contentScriptMatches = manifestSignals?.contentScriptMatches ?? [];
  const matchesCurrentSite = patternsMatchCurrentUrl(hostPermissions);
  const profileHostMatch = patternsMatchCurrentUrl(profileHostPermissions);
  const optionalHostMatch = patternsMatchCurrentUrl(optionalHostPermissions);
  const contentScriptMatch = patternsMatchCurrentUrl(contentScriptMatches);
  const allSitesAccess = [...hostPermissions, ...profileHostPermissions, ...contentScriptMatches].includes("<all_urls>");
  const heuristicMatch = inferHeuristicSiteMatch(extension);
  const homepageMatch = inferHomepageSiteMatch(extension);
  const browserWidePermissionHint = permissions.some((permission) => BROWSER_WIDE_PERMISSION_HINTS.includes(permission));
  const tabLevelPermissionHint = permissions.some((permission) => TAB_LEVEL_PERMISSION_HINTS.includes(permission));

  if (savedForSite) {
    return { score: 400, label: "saved for this site", className: "relevance-high" };
  }
  if (contentScriptMatch) {
    return { score: 330, label: "content script match", className: "relevance-high" };
  }
  if (matchesCurrentSite) {
    return { score: 300, label: "matches this site", className: "relevance-high" };
  }
  if (profileHostMatch) {
    return { score: 300, label: "profile host match", className: "relevance-high" };
  }
  if (homepageMatch) {
    return { score: 300, label: "homepage matches this site", className: "relevance-high" };
  }
  if (pinned) {
    return { score: 250, label: "pinned by you", className: "relevance-mid" };
  }
  if (optionalHostMatch) {
    return { score: 240, label: "optional host match", className: "relevance-mid" };
  }
  if (heuristicMatch) {
    return { score: 300, label: "likely for this site", className: "relevance-high" };
  }
  if (allSitesAccess) {
    return { score: 200, label: "all sites access", className: "relevance-mid" };
  }
  if (hostPermissions.length > 0 || profileHostPermissions.length > 0 || optionalHostPermissions.length > 0) {
    return { score: 100, label: "host access declared", className: "relevance-mid" };
  }
  if (browserWidePermissionHint) {
    return { score: 180, label: "browser-wide control", className: "relevance-mid" };
  }
  if (tabLevelPermissionHint) {
    return { score: 130, label: "tab-level capability", className: "relevance-mid" };
  }
  return { score: 0, label: "unknown", className: "" };
}

function patternsMatchCurrentUrl(patterns) {
  return Boolean(state.tab?.url) && patterns.some((pattern) => matchPattern(pattern, state.tab.url));
}

function inferHeuristicSiteMatch(extension) {
  if (!state.tab?.url) {
    return false;
  }

  let hostname;
  try {
    hostname = new URL(state.tab.url).hostname.toLowerCase();
  } catch {
    return false;
  }

  const heuristic = SITE_RELEVANCE_HEURISTICS.find((candidate) =>
    candidate.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  );

  if (!heuristic) {
    return false;
  }

  const haystack = [
    extension.name,
    extension.shortName,
    extension.description,
    extension.homepageUrl
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return heuristic.keywords.some((keyword) => haystack.includes(keyword));
}

function inferHomepageSiteMatch(extension) {
  if (!state.tab?.url || !extension.homepageUrl) {
    return false;
  }

  let tabUrl;
  let homepageUrl;
  try {
    tabUrl = new URL(state.tab.url);
    homepageUrl = new URL(extension.homepageUrl);
  } catch {
    return false;
  }

  const tabHost = tabUrl.hostname.toLowerCase();
  const homepageHost = homepageUrl.hostname.toLowerCase();

  if (!homepageHost) {
    return false;
  }

  return hostsLikelyMatch(tabHost, homepageHost);
}

function hostsLikelyMatch(leftHost, rightHost) {
  if (!leftHost || !rightHost) {
    return false;
  }

  if (leftHost === rightHost) {
    return true;
  }

  return leftHost.endsWith(`.${rightHost}`) || rightHost.endsWith(`.${leftHost}`);
}

function compareExtensions(left, right) {
  if (right.relevance.score !== left.relevance.score) {
    return right.relevance.score - left.relevance.score;
  }
  if (right.enabled !== left.enabled) {
    return Number(right.enabled) - Number(left.enabled);
  }
  return left.name.localeCompare(right.name);
}

function render() {
  ui.tabTitle.textContent = state.tab?.title || "Current site";
  ui.tabOrigin.textContent = state.origin || state.tab?.url || "";
  ui.metricInstalled.textContent = String(state.extensions.length);
  ui.metricEnabled.textContent = String(state.extensions.filter((extension) => extension.enabled).length);
  ui.metricRelevant.textContent = String(state.extensions.filter((extension) => extension.relevance.score >= 300).length);
  renderActionScopeNote();
  renderSiteProfileCard();
  renderBenchmarkCard();
  disablePrimaryActions(false);

  ui.list.replaceChildren();

  for (const extension of state.extensions) {
    ui.list.appendChild(renderExtension(extension));
  }
}

function renderActionScopeNote() {
  if (!state.origin) {
    ui.actionScopeNote.textContent = "This tab is inventory-only. Browser-wide actions are disabled here because the current tab does not expose a standard web origin.";
    return;
  }

  ui.actionScopeNote.textContent = "Enable, Disable, Lighten, Restore, and Apply change extension state across all tabs and windows. Save and Clear only change this site's saved profile.";
}

function renderSiteProfileCard() {
  const savedCount = state.currentSiteProfile?.allowedExtensionIds?.length ?? 0;
  const updatedAt = state.currentSiteProfile?.updatedAt ? formatDateTime(state.currentSiteProfile.updatedAt) : null;

  if (!state.origin) {
    ui.siteProfileSummary.textContent = "This tab does not expose a standard web origin.";
  } else if (!savedCount) {
    ui.siteProfileSummary.textContent = "No saved setup for this site yet. Save the current enabled set to reuse it later.";
  } else {
    ui.siteProfileSummary.textContent = updatedAt
      ? `${savedCount} extension(s) saved for this site. Last updated ${updatedAt}.`
      : `${savedCount} extension(s) saved for this site.`;
  }

  ui.applySavedSetupButton.disabled = !savedCount;
  ui.clearSavedSetupButton.disabled = !savedCount;
}

function renderBenchmarkCard() {
  const labels = Object.values(state.storage.benchmarkLabels);
  const benchmarkedCount = labels.length;
  const importedCount = labels.filter((label) => label?.source && label.source !== "youtube-3ext-scenario").length;
  const signalCount = Object.keys(state.storage.manifestSignals).length;
  const signalText = signalCount
    ? `${signalCount} manifest signal set(s) loaded.`
    : "No manifest signal sets loaded.";

  if (!benchmarkedCount && !signalCount) {
    ui.benchmarkSummary.textContent = "No probe data loaded.";
  } else if (!benchmarkedCount) {
    ui.benchmarkSummary.textContent = `No benchmark labels loaded. ${signalText}`;
  } else if (!importedCount) {
    ui.benchmarkSummary.textContent = `${benchmarkedCount} benchmark label(s) loaded from the seeded catalog. ${signalText}`;
  } else {
    ui.benchmarkSummary.textContent = `${benchmarkedCount} benchmark label(s) loaded, including ${importedCount} imported label(s). ${signalText}`;
  }

  ui.resetBenchmarksButton.disabled = !benchmarkedCount && !signalCount;
}

function renderExtension(extension) {
  const fragment = ui.template.content.cloneNode(true);
  const row = fragment.querySelector(".extension-row");
  const name = fragment.querySelector(".extension-name");
  const meta = fragment.querySelector(".extension-meta");
  const enabledPill = fragment.querySelector(".enabled-pill");
  const relevancePill = fragment.querySelector(".relevance-pill");
  const impactPill = fragment.querySelector(".impact-pill");
  const memoryImpact = fragment.querySelector(".memory-impact");
  const memoryImpactValue = fragment.querySelector(".memory-impact-value");
  const memoryImpactDetail = fragment.querySelector(".memory-impact-detail");
  const stateToggle = fragment.querySelector(".state-toggle");
  const pinToggle = fragment.querySelector(".pin-toggle");

  name.textContent = extension.name;
  meta.textContent = buildMetaLine(extension);

  enabledPill.textContent = extension.enabled ? "enabled" : "disabled";
  enabledPill.classList.add("pill", extension.enabled ? "enabled" : "disabled");

  relevancePill.textContent = extension.relevance.label;
  if (extension.relevance.className) {
    relevancePill.classList.add(extension.relevance.className);
  }

  const impact = extension.benchmark?.label ?? "unknown";
  impactPill.textContent = extension.benchmark ? `impact: ${impact}` : "impact: not benchmarked";
  if (impact !== "unknown") {
    impactPill.classList.add(`impact-${impact}`);
  }

  renderBenchmarkMemoryImpact(extension, memoryImpact, memoryImpactValue, memoryImpactDetail);

  pinToggle.textContent = extension.pinned ? "Unpin" : "Pin";
  pinToggle.addEventListener("click", () => runWithStatus("Updating pinned set...", async () => {
    await togglePinned(extension.id, !extension.pinned);
    await refresh();
    setStatus(`${extension.pinned ? "Removed" : "Added"} pin for ${extension.name}.`);
  }));

  const canDisable = extension.enabled && extension.mayDisable;
  const canEnable = !extension.enabled && extension.mayEnable !== false;
  const protectedState = !canDisable && !canEnable;

  stateToggle.textContent = protectedState
    ? (extension.enabled ? "Protected" : "Unavailable")
    : (extension.enabled ? "Disable" : "Enable");
  stateToggle.disabled = protectedState;
  stateToggle.title = protectedState
    ? (extension.enabled
      ? "Chrome does not allow this extension to be disabled from EMS."
      : "Chrome does not allow this extension to be enabled from EMS.")
    : "";
  stateToggle.addEventListener("click", () => runWithStatus(`${extension.enabled ? "Disabling" : "Enabling"} ${extension.name}...`, async () => {
    await setExtensionEnabled(extension.id, !extension.enabled);
    await refresh();
    setStatus(`${extension.enabled ? "Disabled" : "Enabled"} ${extension.name} across this browser.`);
  }));

  row.dataset.extensionId = extension.id;
  return fragment;
}

function buildMetaLine(extension) {
  const parts = [];
  parts.push(extension.shortName || extension.name);
  if (extension.version) {
    parts.push(`v${extension.version}`);
  }
  if (extension.pinned) {
    parts.push("pinned");
  }
  if (extension.savedForSite) {
    parts.push("saved");
  }
  if (extension.enabled && !extension.mayDisable) {
    parts.push("cannot disable here");
  }
  if (!extension.enabled && extension.mayEnable === false) {
    parts.push("cannot enable here");
  }
  if (extension.benchmark?.notes) {
    parts.push(extension.benchmark.notes);
  }
  return parts.join(" | ");
}

async function saveCurrentSetupForSite() {
  ensureOrigin();
  const enabledExtensionIds = state.extensions.filter((extension) => extension.enabled).map((extension) => extension.id);
  const previousIds = new Set(state.currentSiteProfile?.allowedExtensionIds ?? []);
  const nextIds = new Set(enabledExtensionIds);
  const siteProfiles = {
    ...state.storage.siteProfiles,
    [state.origin]: {
      origin: state.origin,
      allowedExtensionIds: enabledExtensionIds,
      updatedAt: new Date().toISOString()
    }
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.siteProfiles]: siteProfiles });
  return {
    enabledExtensionIds,
    changed: !sameIdSet(previousIds, nextIds)
  };
}

async function applySavedSetupForSite() {
  ensureOrigin();
  if (!state.currentSiteProfile?.allowedExtensionIds?.length) {
    throw new Error("No saved setup exists for this site.");
  }

  return applyEnabledSet(new Set(state.currentSiteProfile.allowedExtensionIds));
}

async function clearSavedSetupForSite() {
  ensureOrigin();

  if (!state.currentSiteProfile) {
    return;
  }

  const nextProfiles = { ...state.storage.siteProfiles };
  delete nextProfiles[state.origin];
  await chrome.storage.local.set({ [STORAGE_KEYS.siteProfiles]: nextProfiles });
}

async function saveRestoreSnapshot() {
  const enabledExtensionIds = state.extensions.filter((extension) => extension.enabled).map((extension) => extension.id);
  await chrome.storage.local.set({
    [STORAGE_KEYS.restoreSnapshot]: {
      createdAt: new Date().toISOString(),
      enabledExtensionIds
    }
  });
}

async function restorePreviousState() {
  const snapshot = state.storage.restoreSnapshot;
  if (!snapshot?.enabledExtensionIds) {
    throw new Error("No previous state is available to restore.");
  }
  return applyEnabledSet(new Set(snapshot.enabledExtensionIds));
}

async function lightenCurrentSite() {
  ensureOrigin();

  const siteProfile = state.storage.siteProfiles[state.origin];
  const pinnedIds = new Set(state.storage.pinnedExtensionIds);
  const keepEnabledIds = new Set();

  if (siteProfile?.allowedExtensionIds?.length) {
    for (const extensionId of siteProfile.allowedExtensionIds) {
      keepEnabledIds.add(extensionId);
    }
  } else {
    for (const extension of state.extensions) {
      if (extension.pinned || extension.relevance.score >= 300 || extension.relevance.label === "all sites access") {
        keepEnabledIds.add(extension.id);
      }
    }
  }

  for (const extensionId of pinnedIds) {
    keepEnabledIds.add(extensionId);
  }

  return applyEnabledSet(keepEnabledIds);
}

async function applyEnabledSet(keepEnabledIds) {
  const change = {
    enabledNames: [],
    disabledNames: [],
    skippedEnableNames: [],
    skippedDisableNames: []
  };

  for (const extension of state.extensions) {
    const shouldBeEnabled = keepEnabledIds.has(extension.id);
    if (extension.enabled === shouldBeEnabled) {
      continue;
    }
    if (!shouldBeEnabled && !extension.mayDisable) {
      change.skippedDisableNames.push(extension.name);
      continue;
    }
    if (shouldBeEnabled && extension.mayEnable === false) {
      change.skippedEnableNames.push(extension.name);
      continue;
    }
    await setExtensionEnabled(extension.id, shouldBeEnabled);
    if (shouldBeEnabled) {
      change.enabledNames.push(extension.name);
    } else {
      change.disabledNames.push(extension.name);
    }
  }

  return change;
}

async function togglePinned(extensionId, shouldPin) {
  const pinnedSet = new Set(state.storage.pinnedExtensionIds);
  if (shouldPin) {
    pinnedSet.add(extensionId);
  } else {
    pinnedSet.delete(extensionId);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.pinnedExtensionIds]: [...pinnedSet] });
}

async function getDefaultBenchmarkLabels() {
  const response = await chrome.runtime.sendMessage({ type: "ems.get-default-benchmark-labels" });
  if (!response?.ok || !response.benchmarkLabels) {
    throw new Error("Failed to load the default benchmark labels.");
  }
  return response.benchmarkLabels;
}

async function importProbeDataFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  const benchmarkLabels = normalizeBenchmarkPayload(payload);
  const manifestSignals = normalizeManifestSignalPayload(payload);

  if (!Object.keys(benchmarkLabels).length && !Object.keys(manifestSignals).length) {
    throw new Error("The JSON file did not contain usable benchmark labels or manifest signals.");
  }

  return { benchmarkLabels, manifestSignals };
}

function buildImportProbeDataStatus(fileName, benchmarkCount, signalCount) {
  const parts = [];
  if (benchmarkCount > 0) {
    parts.push(`${benchmarkCount} benchmark label(s)`);
  }
  if (signalCount > 0) {
    parts.push(`${signalCount} manifest signal set(s)`);
  }
  return `Imported ${parts.join(" and ")} from ${fileName}.`;
}

function normalizeBenchmarkPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Benchmark import must be a JSON object or array.");
  }

  if (Array.isArray(payload)) {
    return normalizeBenchmarkEntries(payload);
  }

  if (payload.extensions && typeof payload.extensions === "object") {
    return Array.isArray(payload.extensions)
      ? normalizeBenchmarkEntries(payload.extensions)
      : normalizeBenchmarkMap(payload.extensions);
  }

  return normalizeBenchmarkMap(payload);
}

function normalizeBenchmarkEntries(entries) {
  const normalized = {};

  for (const entry of entries) {
    const extensionId = entry?.extensionId;
    if (!isExtensionId(extensionId)) {
      continue;
    }

    const next = normalizeBenchmarkEntry(entry);
    if (next) {
      normalized[extensionId] = next;
    }
  }

  return normalized;
}

function normalizeBenchmarkMap(map) {
  const normalized = {};

  for (const [extensionId, entry] of Object.entries(map)) {
    if (!isExtensionId(extensionId)) {
      continue;
    }

    const next = normalizeBenchmarkEntry(entry);
    if (next) {
      normalized[extensionId] = next;
    }
  }

  return normalized;
}

function normalizeBenchmarkEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const label = normalizeBenchmarkLabel(entry.label ?? entry.impact ?? "unknown");
  const normalized = {
    label,
    source: entry.source ?? "imported-json",
    notes: entry.notes ?? entry.note ?? ""
  };
  const metrics = normalizeBenchmarkMetrics(entry.metrics ?? entry.measurement ?? entry.impactMetrics);
  if (metrics) {
    normalized.metrics = metrics;
  }
  return normalized;
}

function normalizeBenchmarkMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  const normalized = {};
  const numericKeys = [
    "totalPrivateDropBytes",
    "totalWorkingSetDropBytes",
    "rendererPrivateDropBytes",
    "rendererWorkingSetDropBytes",
    "extensionRendererPrivateDropBytes",
    "extensionRendererWorkingSetDropBytes",
    "extensionOwnedPrivateDropBytes",
    "extensionOwnedWorkingSetDropBytes",
    "targetDelta",
    "beforeTargets",
    "afterTargets"
  ];

  for (const key of numericKeys) {
    if (metrics[key] === undefined || metrics[key] === null || metrics[key] === "") {
      continue;
    }
    const value = Number(metrics[key]);
    if (Number.isFinite(value)) {
      normalized[key] = value;
    }
  }

  if (typeof metrics.attribution === "string") {
    normalized.attribution = metrics.attribution;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function renderBenchmarkMemoryImpact(extension, container, valueNode, detailNode) {
  const impact = buildBenchmarkMemoryImpact(extension.benchmark?.metrics);
  if (!impact) {
    return;
  }

  container.hidden = false;
  valueNode.textContent = impact.value;
  detailNode.textContent = impact.detail;
  container.title = impact.title;
}

function buildBenchmarkMemoryImpact(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  const rendererDrop = Number(metrics.rendererPrivateDropBytes ?? 0);
  const totalDrop = Number(metrics.totalPrivateDropBytes ?? 0);
  const extensionRendererDrop = Number(metrics.extensionRendererPrivateDropBytes ?? 0);
  const extensionOwnedDrop = Number(metrics.extensionOwnedPrivateDropBytes ?? 0);
  const primaryDrop = Math.max(rendererDrop, totalDrop, extensionRendererDrop, extensionOwnedDrop);
  if (!Number.isFinite(primaryDrop) || primaryDrop <= 0) {
    return null;
  }

  const detailParts = [];
  if (rendererDrop > 0) {
    detailParts.push(`renderer ${formatBytesForUi(rendererDrop)}`);
  }
  if (totalDrop > 0) {
    detailParts.push(`total ${formatBytesForUi(totalDrop)}`);
  }
  if (extensionRendererDrop > 0) {
    detailParts.push(`extension renderer ${formatBytesForUi(extensionRendererDrop)}`);
  }
  if (extensionOwnedDrop > 0) {
    detailParts.push(`extension process ${formatBytesForUi(extensionOwnedDrop)}`);
  }

  const attribution = metrics.attribution === "scenario-ab-delta" ? "A/B scenario delta" : "probe measurement";
  return {
    value: formatBytesForUi(primaryDrop),
    detail: `${detailParts.join(" / ")} - ${attribution}`,
    title: "Measured by the EMS probe workflow. This is a practical memory impact estimate, not exact live memory ownership."
  };
}

function formatBytesForUi(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}
function normalizeManifestSignalPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if (payload.installedExtensions && typeof payload.installedExtensions === "object") {
    return normalizeManifestSignalMap(payload.installedExtensions, payload.source ?? "profile-inventory");
  }
  if (payload.manifestSignals && typeof payload.manifestSignals === "object") {
    return normalizeManifestSignalMap(payload.manifestSignals, payload.source ?? "manifest-signals");
  }
  if (Array.isArray(payload.extensions)) {
    return normalizeManifestSignalEntries(payload.extensions, payload.source ?? "probe-json");
  }
  if (payload.extensions && typeof payload.extensions === "object") {
    return normalizeManifestSignalMap(payload.extensions, payload.source ?? "probe-json");
  }

  return normalizeManifestSignalMap(payload, payload.source ?? "manifest-signals");
}

function normalizeManifestSignalEntries(entries, source) {
  const normalized = {};
  for (const entry of entries) {
    const extensionId = entry?.extensionId;
    if (!isExtensionId(extensionId)) {
      continue;
    }
    const signals = normalizeManifestSignals(entry.manifestSignals ?? entry.signals ?? entry);
    if (signals) {
      normalized[extensionId] = { ...signals, source };
    }
  }
  return normalized;
}

function normalizeManifestSignalMap(map, source) {
  const normalized = {};
  for (const [extensionId, entry] of Object.entries(map)) {
    if (!isExtensionId(extensionId)) {
      continue;
    }
    const signals = normalizeManifestSignals(entry?.manifestSignals ?? entry?.signals ?? entry);
    if (signals) {
      normalized[extensionId] = { ...signals, source: entry?.source ?? source };
    }
  }
  return normalized;
}

function normalizeManifestSignals(signals) {
  if (!signals || typeof signals !== "object") {
    return null;
  }

  const normalized = {
    hostPermissions: normalizeStringList(signals.hostPermissions ?? signals.host_permissions),
    optionalHostPermissions: normalizeStringList(signals.optionalHostPermissions ?? signals.optional_host_permissions),
    contentScriptMatches: normalizeStringList(signals.contentScriptMatches ?? signals.content_scripts_matches ?? signals.contentScripts)
  };

  return Object.values(normalized).some((values) => values.length > 0) ? normalized : null;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.length > 0))] : [];
}

function normalizeBenchmarkLabel(label) {
  const normalized = String(label).toLowerCase();
  return ["low", "medium", "high", "unknown"].includes(normalized) ? normalized : "unknown";
}

function isExtensionId(value) {
  return typeof value === "string" && /^[a-p]{32}$/.test(value);
}

function buildLightenStatus(change) {
  if (!change.disabledNames.length && !change.enabledNames.length) {
    if (change.skippedDisableNames.length || change.skippedEnableNames.length) {
      return `Lighten This Site could not finish fully across this browser. ${buildSkippedSummary(change)}`;
    }
    return "Lighten This Site made no browser-wide changes. The current enabled set already matches this site's lighter setup.";
  }

  const parts = [];
  if (change.disabledNames.length) {
    parts.push(`Disabled ${change.disabledNames.length}: ${joinNames(change.disabledNames)}.`);
  }
  if (change.enabledNames.length) {
    parts.push(`Enabled ${change.enabledNames.length}: ${joinNames(change.enabledNames)}.`);
  }
  const skippedSummary = buildSkippedSummary(change);
  if (skippedSummary) {
    parts.push(skippedSummary);
  }
  return `Lighten This Site updated browser-wide extension state. ${parts.join(" ")}`;
}

function buildRestoreStatus(change) {
  if (!change.disabledNames.length && !change.enabledNames.length) {
    if (change.skippedDisableNames.length || change.skippedEnableNames.length) {
      return `Restore Previous State could not finish fully across this browser. ${buildSkippedSummary(change)}`;
    }
    return "Restore Previous State made no browser-wide changes. The previous state was already active.";
  }

  const parts = [];
  if (change.enabledNames.length) {
    parts.push(`Re-enabled ${change.enabledNames.length}: ${joinNames(change.enabledNames)}.`);
  }
  if (change.disabledNames.length) {
    parts.push(`Disabled ${change.disabledNames.length}: ${joinNames(change.disabledNames)}.`);
  }
  const skippedSummary = buildSkippedSummary(change);
  if (skippedSummary) {
    parts.push(skippedSummary);
  }
  return `Restored the previous browser-wide extension state. ${parts.join(" ")}`;
}

function buildSaveStatus(result) {
  const enabledExtensions = result?.enabledExtensionIds
    ? state.extensions
      .filter((extension) => result.enabledExtensionIds.includes(extension.id))
      .map((extension) => extension.name)
    : state.extensions.filter((extension) => extension.enabled).map((extension) => extension.name);

  if (result && !result.changed) {
    return `Saved setup already matched the current enabled set for ${state.origin || "this site"}: ${joinNames(enabledExtensions)}. No browser-wide extension state changed.`;
  }

  return `Saved ${enabledExtensions.length} enabled extension(s) for ${state.origin || "this site"}: ${joinNames(enabledExtensions)}. No browser-wide extension state changed.`;
}

function buildApplySavedStatus(change) {
  if (!change.disabledNames.length && !change.enabledNames.length) {
    if (change.skippedDisableNames.length || change.skippedEnableNames.length) {
      return `Apply Saved Setup could not finish fully across this browser. ${buildSkippedSummary(change)}`;
    }
    return `Apply Saved Setup made no browser-wide changes. The saved setup for ${state.origin || "this site"} was already active.`;
  }

  const parts = [];
  if (change.enabledNames.length) {
    parts.push(`Enabled ${change.enabledNames.length}: ${joinNames(change.enabledNames)}.`);
  }
  if (change.disabledNames.length) {
    parts.push(`Disabled ${change.disabledNames.length}: ${joinNames(change.disabledNames)}.`);
  }
  const skippedSummary = buildSkippedSummary(change);
  if (skippedSummary) {
    parts.push(skippedSummary);
  }
  return `Applied the saved setup for ${state.origin || "this site"} across this browser. ${parts.join(" ")}`;
}

function buildSkippedSummary(change) {
  const parts = [];

  if (change.skippedDisableNames?.length) {
    parts.push(`Could not disable ${change.skippedDisableNames.length}: ${joinNames(change.skippedDisableNames)}.`);
  }
  if (change.skippedEnableNames?.length) {
    parts.push(`Could not enable ${change.skippedEnableNames.length}: ${joinNames(change.skippedEnableNames)}.`);
  }

  return parts.join(" ");
}

function joinNames(names) {
  if (!names.length) {
    return "none";
  }
  return names.join(", ");
}

async function runWithStatus(message, fn) {
  try {
    setStatus(message);
    disablePrimaryActions(true);
    await fn();
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    disablePrimaryActions(false);
  }
}

function disablePrimaryActions(disabled) {
  const hasOrigin = Boolean(state.origin);
  const hasSavedSetup = Boolean(state.currentSiteProfile?.allowedExtensionIds?.length);
  const hasBenchmarks = Boolean(Object.keys(state.storage.benchmarkLabels).length);
  const hasManifestSignals = Boolean(Object.keys(state.storage.manifestSignals).length);

  ui.lightenButton.disabled = disabled || !hasOrigin;
  ui.restoreButton.disabled = disabled || !state.storage.restoreSnapshot;
  ui.saveButton.disabled = disabled || !hasOrigin;
  ui.applySavedSetupButton.disabled = disabled || !hasOrigin || !hasSavedSetup;
  ui.clearSavedSetupButton.disabled = disabled || !hasOrigin || !hasSavedSetup;
  ui.importBenchmarksButton.disabled = disabled;
  ui.resetBenchmarksButton.disabled = disabled || (!hasBenchmarks && !hasManifestSignals);
  ui.benchmarkFileInput.disabled = disabled;
}

function setStatus(message, isError = false) {
  ui.status.textContent = message || "";
  ui.status.style.color = isError ? "var(--bad)" : "var(--accent)";
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function ensureOrigin() {
  if (!state.origin) {
    throw new Error("Current tab does not have a standard web origin.");
  }
}

function sameIdSet(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function safeOrigin(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    if (parsed.origin === "null") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function matchPattern(pattern, urlString) {
  if (!pattern || !urlString) {
    return false;
  }
  if (pattern === "<all_urls>") {
    return /^https?:\/\//.test(urlString);
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  const match = pattern.match(/^(\*|http|https|file|ftp):\/\/([^/]+)(\/.*)$/);
  if (!match) {
    return false;
  }

  const [, schemePattern, hostPattern, pathPattern] = match;

  if (schemePattern === "*") {
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
  } else if (url.protocol !== `${schemePattern}:`) {
    return false;
  }

  if (hostPattern !== "*") {
    if (hostPattern.startsWith("*.")) {
      const suffix = hostPattern.slice(2);
      if (url.hostname !== suffix && !url.hostname.endsWith(`.${suffix}`)) {
        return false;
      }
    } else if (url.hostname !== hostPattern) {
      return false;
    }
  }

  const escapedPath = pathPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escapedPath}$`).test(url.pathname + url.search);
}
