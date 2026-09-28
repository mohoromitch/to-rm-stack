import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICES, deviceById, pageSizePt } from "../extension/lib/devices.js";

test("page sizes match each screen's physical size", () => {
  const sizes = Object.fromEntries(DEVICES.map((d) => [d.id, pageSizePt(d)]));
  assert.equal(sizes.rm2.width.toFixed(1), "447.3");
  assert.equal(sizes.rm2.height.toFixed(1), "596.4");
  assert.equal(sizes.rmpp.width.toFixed(1), "509.3");
  assert.equal(sizes.rmpp.height.toFixed(1), "679.1");
  assert.equal(sizes.rmppm.width.toFixed(1), "260.2");
  assert.equal(sizes.rmppm.height.toFixed(1), "462.5");
});

test("unknown device ids fall back to the default device", () => {
  assert.equal(deviceById("nope").id, "rm2");
  assert.equal(deviceById("rmppm").id, "rmppm");
});
