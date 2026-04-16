const DEFAULT_STATE = {
  schemaVersion: 1,
  siteProfiles: {},
  restoreSnapshot: null,
  pinnedExtensionIds: [],
  benchmarkLabels: {
    eimadpbcbfnmbkopoojfekhnkhdbieeh: {
      label: "medium",
      source: "youtube-3ext-scenario",
      notes: "YouTube benchmark: removing Dark Reader reduced renderer private memory."
    },
    cmedmhnddgokbjflbjhkbeakkpaeenkc: {
      label: "high",
      source: "youtube-3ext-scenario",
      notes: "YouTube benchmark: removing Bideo Max reduced total and renderer private memory."
    },
    bnomihfieiccainjcjblhegjgglakjdd: {
      label: "high",
      source: "youtube-3ext-scenario",
      notes: "YouTube benchmark: removing Improve YouTube reduced total and renderer private memory."
    }
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_STATE));
  const nextState = {};

  for (const [key, value] of Object.entries(DEFAULT_STATE)) {
    if (current[key] === undefined) {
      nextState[key] = value;
    }
  }

  if (Object.keys(nextState).length > 0) {
    await chrome.storage.local.set(nextState);
  }
});
