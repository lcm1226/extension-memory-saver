const STORAGE_KEYS = {
  siteProfiles: "siteProfiles",
  restoreSnapshot: "restoreSnapshot",
  pinnedExtensionIds: "pinnedExtensionIds",
  benchmarkLabels: "benchmarkLabels"
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

const state = {
  tab: null,
  origin: null,
  selfId: null,
  extensions: [],
  storage: {
    siteProfiles: {},
    restoreSnapshot: null,
    pinnedExtensionIds: [],
    benchmarkLabels: {}
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
  template: document.getElementById("extension-row-template"),
  lightenButton: document.getElementById("lighten-site"),
  restoreButton: document.getElementById("restore-state"),
  saveButton: document.getElementById("save-setup")
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
    await lightenCurrentSite();
    await refresh();
    setStatus("Applied lighter setup for this site.");
  }));

  ui.restoreButton.addEventListener("click", () => runWithStatus("Restoring previous state...", async () => {
    await restorePreviousState();
    await refresh();
    setStatus("Restored previous extension state.");
  }));

  ui.saveButton.addEventListener("click", () => runWithStatus("Saving site setup...", async () => {
    await saveCurrentSetupForSite();
    await refresh();
    setStatus("Saved current setup for this site.");
  }));
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    throw new Error("No active tab URL is available.");
  }

  const self = await chrome.management.getSelf();
  const storage = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const allExtensions = await chrome.management.getAll();

  state.tab = tab;
  state.origin = safeOrigin(tab.url);
  state.selfId = self.id;
  state.storage = {
    siteProfiles: storage[STORAGE_KEYS.siteProfiles] ?? {},
    restoreSnapshot: storage[STORAGE_KEYS.restoreSnapshot] ?? null,
    pinnedExtensionIds: storage[STORAGE_KEYS.pinnedExtensionIds] ?? [],
    benchmarkLabels: storage[STORAGE_KEYS.benchmarkLabels] ?? {}
  };
  state.extensions = allExtensions
    .filter((extension) => extension.type === "extension" && extension.id !== state.selfId)
    .map((extension) => decorateExtension(extension))
    .sort(compareExtensions);

  render();
}

function decorateExtension(extension) {
  const siteProfile = state.origin ? state.storage.siteProfiles[state.origin] : null;
  const pinned = state.storage.pinnedExtensionIds.includes(extension.id);
  const savedForSite = Boolean(siteProfile?.allowedExtensionIds?.includes(extension.id));
  const relevance = inferRelevance(extension, pinned, savedForSite);
  const benchmark = state.storage.benchmarkLabels[extension.id] ?? null;

  return {
    ...extension,
    pinned,
    savedForSite,
    relevance,
    benchmark
  };
}

function inferRelevance(extension, pinned, savedForSite) {
  const hostPermissions = extension.hostPermissions ?? [];
  const matchesCurrentSite = Boolean(state.tab?.url) && hostPermissions.some((pattern) => matchPattern(pattern, state.tab.url));
  const allSitesAccess = hostPermissions.includes("<all_urls>");
  const heuristicMatch = inferHeuristicSiteMatch(extension);

  if (savedForSite) {
    return { score: 400, label: "saved for this site", className: "relevance-high" };
  }
  if (matchesCurrentSite) {
    return { score: 300, label: "matches this site", className: "relevance-high" };
  }
  if (pinned) {
    return { score: 250, label: "pinned by you", className: "relevance-mid" };
  }
  if (heuristicMatch) {
    return { score: 300, label: "likely for this site", className: "relevance-high" };
  }
  if (allSitesAccess) {
    return { score: 200, label: "all sites access", className: "relevance-mid" };
  }
  if (hostPermissions.length > 0) {
    return { score: 100, label: "host access declared", className: "relevance-mid" };
  }
  return { score: 0, label: "unknown", className: "" };
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
  ui.restoreButton.disabled = !state.storage.restoreSnapshot;

  ui.list.replaceChildren();

  for (const extension of state.extensions) {
    ui.list.appendChild(renderExtension(extension));
  }
}

function renderExtension(extension) {
  const fragment = ui.template.content.cloneNode(true);
  const row = fragment.querySelector(".extension-row");
  const name = fragment.querySelector(".extension-name");
  const meta = fragment.querySelector(".extension-meta");
  const enabledPill = fragment.querySelector(".enabled-pill");
  const relevancePill = fragment.querySelector(".relevance-pill");
  const impactPill = fragment.querySelector(".impact-pill");
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

  pinToggle.textContent = extension.pinned ? "Unpin" : "Pin";
  pinToggle.addEventListener("click", () => runWithStatus("Updating pinned set...", async () => {
    await togglePinned(extension.id, !extension.pinned);
    await refresh();
    setStatus(`${extension.pinned ? "Removed" : "Added"} pin for ${extension.name}.`);
  }));

  const canDisable = extension.enabled && extension.mayDisable;
  const canEnable = !extension.enabled && extension.mayEnable !== false;

  stateToggle.textContent = extension.enabled ? "Disable" : "Enable";
  stateToggle.disabled = !(canDisable || canEnable);
  stateToggle.addEventListener("click", () => runWithStatus(`${extension.enabled ? "Disabling" : "Enabling"} ${extension.name}...`, async () => {
    await chrome.management.setEnabled(extension.id, !extension.enabled);
    await refresh();
    setStatus(`${extension.enabled ? "Disabled" : "Enabled"} ${extension.name}.`);
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
  if (extension.benchmark?.notes) {
    parts.push(extension.benchmark.notes);
  }
  return parts.join(" | ");
}

async function saveCurrentSetupForSite() {
  ensureOrigin();
  const enabledExtensionIds = state.extensions.filter((extension) => extension.enabled).map((extension) => extension.id);
  const siteProfiles = {
    ...state.storage.siteProfiles,
    [state.origin]: {
      origin: state.origin,
      allowedExtensionIds: enabledExtensionIds,
      updatedAt: new Date().toISOString()
    }
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.siteProfiles]: siteProfiles });
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
  await applyEnabledSet(new Set(snapshot.enabledExtensionIds));
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

  await applyEnabledSet(keepEnabledIds);
}

async function applyEnabledSet(keepEnabledIds) {
  for (const extension of state.extensions) {
    const shouldBeEnabled = keepEnabledIds.has(extension.id);
    if (extension.enabled === shouldBeEnabled) {
      continue;
    }
    if (!shouldBeEnabled && !extension.mayDisable) {
      continue;
    }
    if (shouldBeEnabled && extension.mayEnable === false) {
      continue;
    }
    await chrome.management.setEnabled(extension.id, shouldBeEnabled);
  }
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
  ui.lightenButton.disabled = disabled;
  ui.restoreButton.disabled = disabled || !state.storage.restoreSnapshot;
  ui.saveButton.disabled = disabled;
}

function setStatus(message, isError = false) {
  ui.status.textContent = message || "";
  ui.status.style.color = isError ? "var(--bad)" : "var(--accent)";
}

function ensureOrigin() {
  if (!state.origin) {
    throw new Error("Current tab does not have a standard web origin.");
  }
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
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
