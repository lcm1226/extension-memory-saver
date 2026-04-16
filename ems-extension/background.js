const DEFAULT_STATE = {
  schemaVersion: 1,
  siteProfiles: {},
  restoreSnapshot: null,
  pinnedExtensionIds: [],
  benchmarkLabels: {}
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
