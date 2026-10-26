// Admin upload page. Sends each original to /api/upload (behind the admin login), which stores it in
// the private originals bucket at <trip>/<city>/<photos|videos>/<file>; "Process and publish" asks
// /api/process to start the media job. No storage keys ever reach the browser.
(function () {
  "use strict";
  /** Files above this go up in parts: Cloudflare's free plan caps one request at 100 MB. */
  const SINGLE_MAX = 90 * 1024 * 1024;
  const PART_BYTES = 50 * 1024 * 1024;
  /** The server's ceiling for one file (a long 4K clip is far below it). */
  const MAX_BYTES = 5 * 1024 * 1024 * 1024;
  /** How many "-2", "-3"… names to try when a file name is already taken in that city. */
  const MAX_RENAMES = 50;
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
      else if (file.size > MAX_BYTES) Object.assign(row, { state: "skip", note: `${mb(file.size)}: too big` });
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
  function xhr(method, url, body, onProgress, contentType) {
    return new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      if (contentType) x.setRequestHeader("Content-Type", contentType);
      if (onProgress) x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
      x.onload = () => {
        let data = null;
        try {
          data = JSON.parse(x.responseText);
        } catch {
          data = null;
        }
        resolve({ status: x.status, data });
      };
      x.onerror = () => resolve({ status: 0, data: null });
      x.send(body);
    });
  }

  /** "IMG_0001.jpg" → "IMG_0001-2.jpg": cameras reuse names, and the server never overwrites. */
  const withSuffix = (name, n) => (n < 2 ? name : name.replace(/(\.[^.]+)?$/, (ext) => `-${n}${ext || ""}`));
  const urlFor = (key, extra = "") => `/api/upload?key=${encodeURIComponent(key)}${extra}`;
  const progress = (row, done) => {
    row.progress = Math.min(100, Math.round((done / row.file.size) * 100));
    render();
  };

  async function sendWhole(row, key) {
    return xhr("PUT", urlFor(key), row.file, (loaded) => progress(row, loaded), row.file.type || "application/octet-stream");
  }

  async function sendInParts(row, key) {
    const type = row.file.type || "application/octet-stream";
    const start = await xhr("POST", urlFor(key, `&action=start&size=${row.file.size}`), null, null, type);
    if (start.status !== 200) return start;
    const uploadId = start.data.uploadId;
    const parts = [];
    for (let offset = 0, n = 1; offset < row.file.size; offset += PART_BYTES, n++) {
      const chunk = row.file.slice(offset, offset + PART_BYTES);
      // One retry per part: a dropped phone connection shouldn't lose a 300 MB upload.
      let res = await xhr("PUT", urlFor(key, `&uploadId=${encodeURIComponent(uploadId)}&part=${n}`), chunk, (loaded) => progress(row, offset + loaded));
      if (res.status !== 200) res = await xhr("PUT", urlFor(key, `&uploadId=${encodeURIComponent(uploadId)}&part=${n}`), chunk, (loaded) => progress(row, offset + loaded));
      if (res.status !== 200) {
        await xhr("DELETE", urlFor(key, `&uploadId=${encodeURIComponent(uploadId)}`));
        return res;
      }
      parts.push(res.data);
    }
    return xhr("POST", urlFor(key, `&action=finish&uploadId=${encodeURIComponent(uploadId)}`), JSON.stringify(parts), null, "application/json");
  }

  async function send(row) {
    row.state = "uploading";
    row.progress = 0;
    render();
    const name = safeName(row.file.name);
    let res = { status: 0 };
    let used = name;
    for (let n = 1; n <= MAX_RENAMES; n++) {
      used = withSuffix(name, n);
      const key = `${target.value}/${row.kind}/${used}`;
      res = row.file.size > SINGLE_MAX ? await sendInParts(row, key) : await sendWhole(row, key);
      if (res.status !== 409) break;
    }
    if (res.status === 201) Object.assign(row, { state: "done", note: used === name ? "uploaded" : `uploaded as ${used}` });
    else if (res.status === 404) Object.assign(row, { state: "failed", note: "uploads only work on the live site" });
    else if (res.status === 403) Object.assign(row, { state: "failed", note: "signed out: reload and sign in" });
    else if (res.status === 409) Object.assign(row, { state: "failed", note: "too many files with this name" });
    else if (res.status === 0) Object.assign(row, { state: "failed", note: "connection lost, try again" });
    else Object.assign(row, { state: "failed", note: `failed (${res.status}), try again` });
    render();
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
