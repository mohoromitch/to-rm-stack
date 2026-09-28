import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_HOST,
  RemarkableClient,
  RemarkableError,
  UPLOAD_HOST,
  encodeMeta,
  normalizeCode,
  registerDevice,
  tokenExpiry,
} from "../extension/lib/remarkable.js";
import { fakeJwt, memoryStore } from "./helpers.mjs";

function recorder(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch to ${url}`);
    return next;
  };
  return { calls, fetchImpl };
}

test("normalizeCode strips whitespace and rejects bad codes", () => {
  assert.equal(normalizeCode(" abcd efgh "), "abcdefgh");
  assert.throws(() => normalizeCode("short"), RemarkableError);
});

test("encodeMeta base64-encodes UTF-8 JSON", () => {
  const meta = encodeMeta({ file_name: "Café ☕" });
  assert.deepEqual(JSON.parse(Buffer.from(meta, "base64").toString("utf8")), { file_name: "Café ☕" });
});

test("tokenExpiry reads exp from a JWT and tolerates garbage", () => {
  assert.equal(tokenExpiry(fakeJwt(1_800_000_000)), 1_800_000_000_000);
  assert.equal(tokenExpiry("not-a-jwt"), null);
});

test("registerDevice sends the browser registration request", async () => {
  const { calls, fetchImpl } = recorder([new Response("device-token\n")]);
  const result = await registerDevice("ABCDEFGH", { fetchImpl, deviceId: "uuid-1" });
  assert.deepEqual(result, { deviceToken: "device-token", deviceId: "uuid-1" });
  assert.equal(calls[0].url, `${AUTH_HOST}/token/json/2/device/new`);
  assert.equal(calls[0].init.headers.Authorization, "Bearer");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    code: "abcdefgh",
    deviceDesc: "browser-chrome",
    deviceID: "uuid-1",
  });
});

test("registerDevice surfaces a rejected code", async () => {
  const { fetchImpl } = recorder([new Response("bad code", { status: 400 })]);
  await assert.rejects(registerDevice("abcdefgh", { fetchImpl }), (e) => e.status === 400);
});

test("upload fetches a session token, caches it, and posts the file", async () => {
  const session = fakeJwt(2_000_000_000);
  const { calls, fetchImpl } = recorder([
    new Response(session),
    Response.json({ docID: "doc-1", hash: "h1" }),
    Response.json({ docID: "doc-2", hash: "h2" }),
  ]);
  const store = memoryStore({ deviceToken: "dev" });
  const client = new RemarkableClient({ store, fetchImpl, now: () => 1_900_000_000_000 });
  const bytes = new Uint8Array([37, 80, 68, 70]);

  assert.deepEqual(await client.upload(bytes, "My doc"), { docID: "doc-1", hash: "h1" });
  assert.deepEqual(await client.upload(bytes, "Second"), { docID: "doc-2", hash: "h2" });

  assert.equal(calls.length, 3, "second upload reuses the cached session token");
  assert.equal(calls[0].url, `${AUTH_HOST}/token/json/2/user/new`);
  assert.equal(calls[0].init.headers.Authorization, "Bearer dev");
  const upload = calls[1];
  assert.equal(upload.url, `${UPLOAD_HOST}/doc/v2/files`);
  assert.equal(upload.init.headers.Authorization, `Bearer ${session}`);
  assert.equal(upload.init.headers["Content-Type"], "application/pdf");
  assert.equal(upload.init.headers["rm-source"], "RoR-Browser");
  assert.deepEqual(JSON.parse(atob(upload.init.headers["rm-meta"])), { file_name: "My doc" });
  assert.equal(upload.init.body, bytes);
});

test("upload refreshes the session token once after a 401", async () => {
  const { calls, fetchImpl } = recorder([
    new Response("", { status: 401 }),
    new Response(fakeJwt(2_000_000_000)),
    Response.json({ docID: "doc-1", hash: "h1" }),
  ]);
  const store = memoryStore({ deviceToken: "dev", userToken: "stale", userTokenExpiry: 2_000_000_000_000 });
  const client = new RemarkableClient({ store, fetchImpl, now: () => 1_900_000_000_000 });
  assert.equal((await client.upload(new Uint8Array([1]), "x")).docID, "doc-1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer stale");
  assert.equal(calls[1].url, `${AUTH_HOST}/token/json/2/user/new`);
});

test("upload without pairing fails with a clear message", async () => {
  const client = new RemarkableClient({ store: memoryStore(), fetchImpl: async () => assert.fail("no fetch") });
  await assert.rejects(client.upload(new Uint8Array([1]), "x"), /Pair the extension/);
});

test("pair stores the device token and unpair clears everything", async () => {
  const { fetchImpl } = recorder([new Response("dev-token")]);
  const store = memoryStore({ userToken: "old" });
  const client = new RemarkableClient({ store, fetchImpl, now: () => 42 });
  const status = await client.pair("abcdefgh");
  assert.equal(status.paired, true);
  assert.equal(store.data.deviceToken, "dev-token");
  assert.equal(store.data.userToken, undefined);
  await client.unpair();
  assert.deepEqual(store.data, {});
});
