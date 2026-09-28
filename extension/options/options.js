import { DEVICES } from "../lib/devices.js";
import { CONNECT_URL } from "../lib/remarkable.js";

const $ = (id) => document.getElementById(id);
const call = (type, payload = {}) => browser.runtime.sendMessage({ type, ...payload });
const ALL_SITES = { origins: ["<all_urls>"] };

function flash(el, text, cls = "muted") {
  el.textContent = text;
  el.className = cls;
}

async function renderPairing() {
  const status = await call("status");
  $("pair-form").hidden = status.paired;
  $("unpair-form").hidden = !status.paired;
  $("pair-status").textContent = status.paired
    ? `Paired on ${new Date(status.pairedAt).toLocaleString()}.`
    : "Not paired.";
}

async function renderPermissions() {
  $("permissions").hidden = await browser.permissions.contains(ALL_SITES);
}

async function save(patch) {
  await call("updateSettings", { patch });
  flash($("saved"), "Saved.");
}

async function init() {
  $("connect-link").href = CONNECT_URL;
  for (const device of DEVICES) $("device").add(new Option(device.name, device.id));

  const settings = await call("getSettings");
  $("device").value = settings.device;
  document.querySelector(`input[name="gdocLayout"][value="${settings.gdocLayout}"]`).checked = true;
  $("trim").checked = settings.trimDocMargins;
  $("font-size").value = settings.fontSize ?? "";

  $("device").addEventListener("change", () => save({ device: $("device").value }));
  for (const radio of document.querySelectorAll('input[name="gdocLayout"]')) {
    radio.addEventListener("change", () => save({ gdocLayout: radio.value }));
  }
  $("trim").addEventListener("change", () => save({ trimDocMargins: $("trim").checked }));
  $("font-size").addEventListener("change", () => {
    const value = Number($("font-size").value);
    save({ fontSize: $("font-size").value === "" || !Number.isFinite(value) ? null : value });
  });

  $("grant").addEventListener("click", async () => {
    await browser.permissions.request(ALL_SITES);
    await renderPermissions();
  });

  $("pair").addEventListener("click", async () => {
    $("pair").disabled = true;
    flash($("pair-result"), "Pairing…");
    const result = await call("pair", { code: $("code").value });
    $("pair").disabled = false;
    if (result.error) {
      flash($("pair-result"), result.error, "error");
      return;
    }
    $("code").value = "";
    flash($("pair-result"), "Paired. You can now send tabs from the toolbar button.", "ok");
    await renderPairing();
  });

  $("unpair").addEventListener("click", async () => {
    await call("unpair");
    flash($("pair-result"), "Unpaired.");
    await renderPairing();
  });

  await Promise.all([renderPairing(), renderPermissions()]);
}

init().catch((error) => flash($("pair-result"), error.message, "error"));
