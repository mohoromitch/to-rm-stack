import { DEFAULT_DEVICE_ID } from "./devices.js";

export const DEFAULT_SETTINGS = {
  device: DEFAULT_DEVICE_ID,
  gdocLayout: "original",
  trimDocMargins: true,
  fontSize: null,
};

export async function getSettings() {
  const { settings } = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ settings: next });
  return next;
}

export const localStore = {
  get: (keys) => browser.storage.local.get(keys),
  set: (items) => browser.storage.local.set(items),
  remove: (keys) => browser.storage.local.remove(keys),
};
