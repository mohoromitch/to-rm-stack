import { DEVICES } from "../lib/devices.js";

const $ = (id) => document.getElementById(id);
const call = (type, payload = {}) => browser.runtime.sendMessage({ type, ...payload });

const KIND_LABELS = {
  gdoc: "Google Doc",
  pdf: "PDF (sent as is)",
  article: "Web article",
};

function setStatus(text, cls = "") {
  $("status").textContent = text;
  $("status").className = cls;
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  for (const device of DEVICES) $("device").add(new Option(device.name, device.id));

  const { info, status, settings, title, busy, error } = await call("inspect", { tabId: tab.id });
  if (error) {
    $("source").textContent = error;
    return;
  }
  $("device").value = settings.device;
  document.querySelector(`input[name="gdocLayout"][value="${settings.gdocLayout}"]`).checked = true;

  if (info.kind === "unsupported") {
    $("source").textContent = info.reason;
    return;
  }
  $("source").textContent = `${KIND_LABELS[info.kind]}: ${title}`;
  if (info.kind === "article" && info.readerable === false) {
    $("source").textContent += " (this page may not be an article)";
  }
  $("gdoc-layout").hidden = info.kind !== "gdoc";
  $("pair-hint").hidden = status.paired;
  $("send").disabled = !status.paired || busy;
  $("preview").disabled = busy;
  if (busy) setStatus("Another send is in progress…");

  $("device").addEventListener("change", () => call("updateSettings", { patch: { device: $("device").value } }));
  for (const radio of document.querySelectorAll('input[name="gdocLayout"]')) {
    radio.addEventListener("change", () => call("updateSettings", { patch: { gdocLayout: radio.value } }));
  }

  const run = async (type, done) => {
    $("send").disabled = $("preview").disabled = true;
    setStatus("Starting…");
    const result = await call(type, { tabId: tab.id, deviceId: $("device").value });
    $("preview").disabled = false;
    $("send").disabled = !status.paired;
    if (result.ok) setStatus(done(result), "ok");
    else setStatus(result.error, "error");
  };
  $("send").addEventListener("click", () =>
    run("send", (r) => `Sent “${r.name}” (${Math.round(r.bytes / 1024)} KB).`),
  );
  $("preview").addEventListener("click", () => run("preview", (r) => `Opened a preview of “${r.name}”.`));
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "progress") setStatus(message.text);
});

for (const id of ["open-options", "settings-link"]) {
  $(id).addEventListener("click", (event) => {
    event.preventDefault();
    browser.runtime.openOptionsPage();
    window.close();
  });
}

init().catch((error) => setStatus(error.message, "error"));
