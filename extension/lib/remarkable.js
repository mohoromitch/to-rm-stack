export const AUTH_HOST = "https://webapp-prod.cloud.remarkable.engineering";
export const UPLOAD_HOST = "https://internal.cloud.remarkable.com";
export const CONNECT_URL = "https://my.remarkable.com/device/browser/connect";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class RemarkableError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "RemarkableError";
    this.status = status;
    this.body = body;
  }
}

export function normalizeCode(code) {
  const cleaned = String(code ?? "").replace(/\s+/g, "").toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(cleaned)) {
    throw new RemarkableError("The one-time code must be 8 characters.");
  }
  return cleaned;
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function encodeMeta(meta) {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(meta)));
}

export function tokenExpiry(jwt) {
  try {
    const payload = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
    );
    const { exp } = JSON.parse(json);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function readError(response, fallback) {
  const body = await response.text().catch(() => "");
  return new RemarkableError(`${fallback} (HTTP ${response.status})`, { status: response.status, body });
}

export async function registerDevice(code, { fetchImpl = fetch, deviceId = crypto.randomUUID() } = {}) {
  const response = await fetchImpl(`${AUTH_HOST}/token/json/2/device/new`, {
    method: "POST",
    headers: { Authorization: "Bearer", "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizeCode(code), deviceDesc: "browser-chrome", deviceID: deviceId }),
  });
  if (!response.ok) {
    throw await readError(response, "reMarkable rejected the one-time code. Get a new code and try again");
  }
  const deviceToken = (await response.text()).trim();
  if (!deviceToken) throw new RemarkableError("reMarkable returned an empty device token.");
  return { deviceToken, deviceId };
}

export async function fetchUserToken(deviceToken, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${AUTH_HOST}/token/json/2/user/new`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  if (!response.ok) {
    throw await readError(response, "Couldn't get a reMarkable session. Pair the extension again");
  }
  return (await response.text()).trim();
}

export async function uploadDocument({ userToken, bytes, name, mime = "application/pdf", fetchImpl = fetch }) {
  const response = await fetchImpl(`${UPLOAD_HOST}/doc/v2/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": mime,
      "rm-meta": encodeMeta({ file_name: name }),
      "rm-source": "RoR-Browser",
    },
    body: bytes,
  });
  if (!response.ok) {
    throw await readError(response, "The reMarkable cloud rejected the upload");
  }
  const { docID, hash } = await response.json();
  return { docID, hash };
}

export class RemarkableClient {
  constructor({ store, fetchImpl = (...args) => fetch(...args), now = () => Date.now() }) {
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async status() {
    const { deviceToken, deviceId, pairedAt } = await this.store.get(["deviceToken", "deviceId", "pairedAt"]);
    return { paired: Boolean(deviceToken), deviceId: deviceId ?? null, pairedAt: pairedAt ?? null };
  }

  async pair(code) {
    const { deviceToken, deviceId } = await registerDevice(code, { fetchImpl: this.fetchImpl });
    await this.store.remove(["userToken", "userTokenExpiry"]);
    await this.store.set({ deviceToken, deviceId, pairedAt: this.now() });
    return this.status();
  }

  async unpair() {
    await this.store.remove(["deviceToken", "deviceId", "pairedAt", "userToken", "userTokenExpiry"]);
  }

  async userToken({ force = false } = {}) {
    const { deviceToken, userToken, userTokenExpiry } = await this.store.get([
      "deviceToken",
      "userToken",
      "userTokenExpiry",
    ]);
    if (!deviceToken) throw new RemarkableError("Pair the extension with your reMarkable account first.");
    if (!force && userToken && userTokenExpiry && userTokenExpiry - TOKEN_REFRESH_MARGIN_MS > this.now()) {
      return userToken;
    }
    const fresh = await fetchUserToken(deviceToken, { fetchImpl: this.fetchImpl });
    await this.store.set({ userToken: fresh, userTokenExpiry: tokenExpiry(fresh) ?? this.now() + 60 * 60 * 1000 });
    return fresh;
  }

  async upload(bytes, name, mime = "application/pdf") {
    const attempt = async (force) =>
      uploadDocument({ userToken: await this.userToken({ force }), bytes, name, mime, fetchImpl: this.fetchImpl });
    try {
      return await attempt(false);
    } catch (error) {
      if (error instanceof RemarkableError && (error.status === 401 || error.status === 403)) {
        return attempt(true);
      }
      throw error;
    }
  }
}
