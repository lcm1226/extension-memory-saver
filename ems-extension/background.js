const DEFAULT_BENCHMARK_LABELS = {
  eimadpbcbfnmbkopoojfekhnkhdbieeh: {
    label: "medium",
    source: "youtube-3ext-scenario",
    metrics: {
      attribution: "scenario-ab-delta",
      totalPrivateDropBytes: 56770560,
      rendererPrivateDropBytes: 57294848,
      targetDelta: -1
    },
    confidence: "medium",
    measuredAt: "2026-04-24",
    targetUrl: "https://www.youtube.com/watch?v=pa4Xo-LQe54",
    repeatCount: 1,
    notes: "YouTube benchmark: removing Dark Reader reduced renderer private memory."
  },
  cmedmhnddgokbjflbjhkbeakkpaeenkc: {
    label: "high",
    source: "youtube-3ext-scenario",
    metrics: {
      attribution: "scenario-ab-delta",
      totalPrivateDropBytes: 76251136,
      rendererPrivateDropBytes: 64585728,
      targetDelta: -1
    },
    confidence: "medium",
    measuredAt: "2026-04-24",
    targetUrl: "https://www.youtube.com/watch?v=pa4Xo-LQe54",
    repeatCount: 1,
    notes: "YouTube benchmark: removing Bideo Max reduced total and renderer private memory."
  },
  bnomihfieiccainjcjblhegjgglakjdd: {
    label: "high",
    source: "youtube-3ext-scenario",
    metrics: {
      attribution: "scenario-ab-delta",
      totalPrivateDropBytes: 76693504,
      rendererPrivateDropBytes: 83185664,
      targetDelta: -1
    },
    confidence: "medium",
    measuredAt: "2026-04-24",
    targetUrl: "https://www.youtube.com/watch?v=pa4Xo-LQe54",
    repeatCount: 1,
    notes: "YouTube benchmark: removing Improve YouTube reduced total and renderer private memory."
  }
};

const DEFAULT_MEMORY_ESTIMATES = {};
const LIVE_PAUSE_ALARM_NAME = "ems-live-pause-auto-restore";

const DEFAULT_STATE = {
  schemaVersion: 3,
  siteProfiles: {},
  restoreSnapshot: null,
  livePauseSession: null,
  pinnedExtensionIds: [],
  benchmarkLabels: DEFAULT_BENCHMARK_LABELS,
  manifestSignals: {},
  memoryEstimates: DEFAULT_MEMORY_ESTIMATES
};

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultState();
  await rearmLivePauseAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaultState();
  await rearmLivePauseAlarm();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ems.ensure-default-state") {
    ensureDefaultState()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message?.type === "ems.get-default-benchmark-labels") {
    sendResponse({ ok: true, benchmarkLabels: DEFAULT_BENCHMARK_LABELS });
    return false;
  }

  if (message?.type === "ems.begin-live-pause") {
    beginLivePause(message.session)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message?.type === "ems.clear-live-pause") {
    clearLivePause()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  restoreLivePauseForTabEvent(tabId, "tab closed").catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  restoreLivePauseForNavigation(tabId, changeInfo.url).catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== LIVE_PAUSE_ALARM_NAME) return;
  restoreLivePauseSession("timer elapsed").catch(() => {});
});

async function ensureDefaultState() {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_STATE));
  const nextState = {};

  if (current.schemaVersion !== DEFAULT_STATE.schemaVersion) {
    nextState.schemaVersion = DEFAULT_STATE.schemaVersion;
  }

  if (current.siteProfiles === undefined) {
    nextState.siteProfiles = DEFAULT_STATE.siteProfiles;
  }

  if (current.restoreSnapshot === undefined) {
    nextState.restoreSnapshot = DEFAULT_STATE.restoreSnapshot;
  }

  if (current.livePauseSession === undefined) {
    nextState.livePauseSession = DEFAULT_STATE.livePauseSession;
  }

  if (current.pinnedExtensionIds === undefined) {
    nextState.pinnedExtensionIds = DEFAULT_STATE.pinnedExtensionIds;
  }

  if (current.manifestSignals === undefined) {
    nextState.manifestSignals = DEFAULT_STATE.manifestSignals;
  }

  if (current.memoryEstimates === undefined) {
    nextState.memoryEstimates = DEFAULT_STATE.memoryEstimates;
  }

  const mergedBenchmarkLabels = mergeBenchmarkLabels(current.benchmarkLabels ?? {});

  const benchmarkNeedsUpdate =
    current.benchmarkLabels === undefined ||
    JSON.stringify(mergedBenchmarkLabels) !== JSON.stringify(current.benchmarkLabels ?? {});

  if (benchmarkNeedsUpdate) {
    nextState.benchmarkLabels = mergedBenchmarkLabels;
  }

  if (Object.keys(nextState).length > 0) {
    await chrome.storage.local.set(nextState);
  }
}

async function beginLivePause(session) {
  if (!session?.snapshot?.extensionStates?.length && !session?.snapshot?.enabledExtensionIds?.length) {
    throw new Error("Live pause session is missing a restore snapshot.");
  }

  const expiresAtMs = Date.parse(session.expiresAt);
  const normalizedSession = {
    ...session,
    createdAt: session.createdAt || new Date().toISOString(),
    expiresAt: Number.isFinite(expiresAtMs)
      ? session.expiresAt
      : new Date(Date.now() + 30 * 60 * 1000).toISOString()
  };
  await chrome.storage.local.set({ livePauseSession: normalizedSession });
  await scheduleLivePauseAlarm(normalizedSession);
}

async function clearLivePause() {
  await chrome.storage.local.remove("livePauseSession");
  await chrome.alarms.clear(LIVE_PAUSE_ALARM_NAME);
}

async function rearmLivePauseAlarm() {
  const { livePauseSession } = await chrome.storage.local.get("livePauseSession");
  if (!livePauseSession) return;

  const expiresAtMs = Date.parse(livePauseSession.expiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    await restoreLivePauseSession("startup expired");
    return;
  }

  await scheduleLivePauseAlarm(livePauseSession);
}

async function scheduleLivePauseAlarm(session) {
  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return;
  await chrome.alarms.create(LIVE_PAUSE_ALARM_NAME, { when: Math.max(Date.now() + 1000, expiresAtMs) });
}

async function restoreLivePauseForTabEvent(tabId, reason) {
  const { livePauseSession } = await chrome.storage.local.get("livePauseSession");
  if (!livePauseSession || livePauseSession.tabId !== tabId) return;
  await restoreLivePauseSession(reason);
}

async function restoreLivePauseForNavigation(tabId, url) {
  const { livePauseSession } = await chrome.storage.local.get("livePauseSession");
  if (!livePauseSession || livePauseSession.tabId !== tabId) return;

  const nextOrigin = safeOrigin(url);
  if (!nextOrigin || nextOrigin !== livePauseSession.origin) {
    await restoreLivePauseSession("left origin");
  }
}

async function restoreLivePauseSession(_reason) {
  const { livePauseSession } = await chrome.storage.local.get("livePauseSession");
  if (!livePauseSession?.snapshot) return;

  await restoreExtensionStates(livePauseSession.snapshot);
  await clearLivePause();
}

async function restoreExtensionStates(snapshot) {
  const allExtensions = await chrome.management.getAll();
  const stateMap = new Map();
  if (Array.isArray(snapshot.extensionStates)) {
    for (const entry of snapshot.extensionStates) {
      if (typeof entry?.id === "string") {
        stateMap.set(entry.id, Boolean(entry.enabled));
      }
    }
  } else if (Array.isArray(snapshot.enabledExtensionIds)) {
    const enabledIds = new Set(snapshot.enabledExtensionIds);
    for (const extension of allExtensions) {
      stateMap.set(extension.id, enabledIds.has(extension.id));
    }
  }

  const self = await chrome.management.getSelf();
  for (const extension of allExtensions) {
    if (extension.type !== "extension" || extension.id === self.id || !stateMap.has(extension.id)) {
      continue;
    }
    const shouldBeEnabled = stateMap.get(extension.id);
    if (extension.enabled === shouldBeEnabled) {
      continue;
    }
    if (!shouldBeEnabled && extension.mayDisable === false) {
      continue;
    }
    try {
      await chrome.management.setEnabled(extension.id, shouldBeEnabled);
    } catch {
      // Chrome can reject protected/unavailable extensions; continue restoring the rest.
    }
  }
}

function safeOrigin(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

function mergeBenchmarkLabels(existingLabels) {
  const merged = { ...DEFAULT_BENCHMARK_LABELS };

  for (const [extensionId, label] of Object.entries(existingLabels)) {
    const defaultLabel = DEFAULT_BENCHMARK_LABELS[extensionId];
    const canBackfillSeedMetadata = defaultLabel && (!label.source || label.source === defaultLabel.source);
    merged[extensionId] = canBackfillSeedMetadata
      ? { ...defaultLabel, ...label }
      : label;
  }

  return merged;
}
