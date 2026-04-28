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

const DEFAULT_STATE = {
  schemaVersion: 2,
  siteProfiles: {},
  restoreSnapshot: null,
  pinnedExtensionIds: [],
  benchmarkLabels: DEFAULT_BENCHMARK_LABELS,
  manifestSignals: {}
};

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultState();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaultState();
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

  return false;
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

  if (current.pinnedExtensionIds === undefined) {
    nextState.pinnedExtensionIds = DEFAULT_STATE.pinnedExtensionIds;
  }

  if (current.manifestSignals === undefined) {
    nextState.manifestSignals = DEFAULT_STATE.manifestSignals;
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
