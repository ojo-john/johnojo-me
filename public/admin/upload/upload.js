// Admin upload page. Sends each original to /api/upload (behind the admin login), which stores it in
// the private originals bucket at <trip>/<city>/<photos|videos>/<file>; "Process and publish" asks
// /api/process to start the media job. No storage keys ever reach the browser.
(function () {
  "use strict";
  /** Cloudflare's request limit on the free plan; the server enforces it too. */
  const MAX_BYTES = 100 * 1024 * 1024;
  const PHOTO = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;
  const VIDEO = /\.(mp4|mov|m4v)$/i;
  const $ = (id) => document.getElementById(id);
  const target = $("target"), list = $("list"), status = $("status"), uploadBtn = $("upload"), processBtn = $("process");
  let queue = [];
  let uploadedAny = false;

  const say = (text, cls = "") => {
    status.textContent = text;
    status.className = cls;
  };
  // The server only accepts plain names: keep letters, numbers and . _ - ( ) + and spaces.
  const safeName = (name) => name.replace(/[^A-Za-z0-9 ._+()-]/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 100) || "file";
  const kindOf = (name) => (PHOTO.test(name) ? "photos" : VIDEO.test(name) ? "videos" : null);
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  fetch("/admin/media.json", { credentials: "same-origin" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((index) => {
      target.innerHTML = "";
      const targets = [...index.uploadTargets].sort((a, b) => b.visit.localeCompare(a.visit));
      for (const t of targets) target.add(new Option(t.label, t.path));
      target.disabled = false;
      refresh();
    })
    .catch((err) => say(`Couldn't load the list of cities (${err.message}). Reload to try again.`, "bad"));

  function add(files) {
    for (const file of files) {
      const kind = kindOf(file.name);
      const row = { file, kind, state: "queued", note: "" };
      if (!kind) Object.assign(row, { state: "skip", note: "not a photo or video" });
      else if (file.size > MAX_BYTES) Object.assign(row, { state: "skip", note: `${mb(file.size)}: over 100 MB, trim it first` });
      queue.push(row);
    }
    render();
  }

  function render() {
    list.innerHTML = "";
    for (const row of queue) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `${row.file.name} · ${mb(row.file.size)}`;
      const state = document.createElement("span");
      state.className = row.state === "done" ? "ok" : row.state === "failed" || row.state === "skip" ? "bad" : "muted";
      state.textContent = row.state === "uploading" ? `${row.progress ?? 0}%` : row.note || row.state;
      li.append(name, state);
      if (row.state === "uploading") {
        const bar = document.createElement("progress");
        bar.max = 100;
        bar.value = row.progress ?? 0;
        li.append(bar);
      }
      list.append(li);
    }
    refresh();
  }

  function refresh() {
    const busy = queue.some((r) => r.state === "uploading");
    uploadBtn.disabled = busy || target.disabled || !queue.some((r) => r.state === "queued" || r.state === "failed");
    processBtn.disabled = busy || !uploadedAny;
  }

  // XHR rather than fetch: it reports upload progress, which matters for large clips on a phone.
  function send(row) {
    return new Promise((resolve) => {
      const key = `${target.value}/${row.kind}/${safeName(row.file.name)}`;
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/upload?key=${encodeURIComponent(key)}`);
      xhr.setRequestHeader("Content-Type", row.file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          row.progress = Math.round((e.loaded / e.total) * 100);
          render();
        }
      };
      xhr.onload = () => {
        if (xhr.status === 201) Object.assign(row, { state: "done", note: "uploaded" });
        else if (xhr.status === 404) Object.assign(row, { state: "failed", note: "uploads only work on the live site" });
        else if (xhr.status === 403) Object.assign(row, { state: "failed", note: "signed out: reload and sign in" });
        else Object.assign(row, { state: "failed", note: `failed (${xhr.status}), try again` });
        resolve();
      };
      xhr.onerror = () => {
        Object.assign(row, { state: "failed", note: "connection lost, try again" });
        resolve();
      };
      row.state = "uploading";
      row.progress = 0;
      render();
      xhr.send(row.file);
    });
  }

  uploadBtn.addEventListener("click", async () => {
    say("");
    // One at a time: kinder to a phone's connection, and a failure only affects its own file.
    for (const row of queue.filter((r) => r.state === "queued" || r.state === "failed")) await send(row);
    const done = queue.filter((r) => r.state === "done").length;
    uploadedAny = uploadedAny || done > 0;
    const failed = queue.filter((r) => r.state === "failed").length;
    say(failed ? `${done} uploaded, ${failed} failed. Press Upload to retry the failed ones.` : `${done} uploaded. Add more, or press "Process and publish".`, failed ? "bad" : "ok");
    render();
  });

  processBtn.addEventListener("click", async () => {
    processBtn.disabled = true;
    say("Starting…");
    try {
      const r = await fetch("/api/process", { method: "POST", credentials: "same-origin" });
      if (r.status !== 202) throw new Error(`HTTP ${r.status}`);
      say("Processing started. The site updates in a few minutes. You can close this page.", "ok");
      queue = queue.filter((row) => row.state !== "done");
      uploadedAny = false;
      render();
    } catch (err) {
      say(`Couldn't start processing (${err.message}). Try again in a minute.`, "bad");
      processBtn.disabled = false;
    }
  });

  $("files").addEventListener("change", (e) => {
    add(e.target.files);
    e.target.value = "";
  });
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    add(e.dataTransfer.files);
  });
})();
