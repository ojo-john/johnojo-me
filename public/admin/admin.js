// Toolbar links in the editor (shown after signing in): "Site metrics" and "Upload photos". Each opens
// its page in a new tab; pages can't be embedded because /admin/* forbids framing.
if (window.CMS && typeof window.CMS.registerCustomPage === "function") {
  window.CMS.registerCustomPage({ id: "dashboard", label: "Dashboard", icon: "space_dashboard", url: "/admin/", newTab: false });
  window.CMS.registerCustomPage({ id: "metrics", label: "Site metrics", icon: "monitoring", url: "/admin/metrics/", newTab: true });
  window.CMS.registerCustomPage({ id: "upload", label: "Upload photos", icon: "upload", url: "/admin/upload/", newTab: true });
}

// "cover-picker" field: shows every photo for this visit (or, on a trip, every stop's photos) and stores
// the one you click as the cover. The list comes from /admin/media.json, built with the site; photos
// added since the last `npm run media` and build won't appear until then.
(function registerCoverPicker() {
  const CMS = window.CMS;
  const React = globalThis.__SVELTIA_CMS_REACT__;
  if (!CMS || !React || typeof CMS.registerWidget !== "function") return;
  const h = React.createElement;
  let indexPromise = null;
  const loadIndex = () =>
    (indexPromise ??= fetch("/admin/media.json", { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }));

  // Entries and field configs arrive as Immutable-style maps or plain objects depending on the version.
  const read = (obj, path) => {
    if (!obj) return undefined;
    if (typeof obj.getIn === "function") return obj.getIn(path);
    return path.reduce((o, k) => (o == null ? undefined : typeof o.get === "function" ? o.get(k) : o[k]), obj);
  };
  /** "europe-2026--barcelona" for a visit, "europe-2026" for a trip, from the file path or the fields. */
  const entryKey = (entry, scope) => {
    const file = String(read(entry, ["path"]) ?? "");
    const fromPath = scope === "trip" ? file.match(/trips\/([^/]+)\/trip\.yaml$/) : file.match(/visits\/([^/]+)\.yaml$/);
    if (fromPath) return fromPath[1];
    const trip = read(entry, ["data", "trip"]);
    return scope === "trip" ? read(entry, ["slug"]) : trip && `${trip}--${read(entry, ["data", "destination"])}`;
  };

  const tile = (photo, selected, onPick) =>
    h(
      "button",
      {
        key: photo.file,
        type: "button",
        title: photo.file + (photo.hidden ? " (hidden)" : "") + (photo.duplicate ? " (duplicate)" : ""),
        onClick: () => onPick(photo.file),
        style: {
          position: "relative", padding: 0, border: selected ? "3px solid #2541b2" : "1px solid #ccc", borderRadius: 6,
          background: "#eee", cursor: "pointer", aspectRatio: "1", overflow: "hidden", opacity: photo.hidden || photo.duplicate ? 0.45 : 1,
        },
      },
      h("img", {
        src: photo.thumb,
        alt: "",
        loading: "lazy",
        // Hidden photos are never uploaded to public storage; show the blurred stand-in instead of a broken image.
        onError: (e) => {
          if (photo.placeholder && e.currentTarget.src !== photo.placeholder) e.currentTarget.src = photo.placeholder;
        },
        style: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
      }),
      h(
        "span",
        { style: { position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.6)", color: "#fff", font: "11px ui-monospace, Menlo, monospace", padding: "2px 4px", textAlign: "left" } },
        (selected ? "★ cover · " : "") + photo.file.split("/").pop() + (photo.hidden ? " · hidden" : photo.duplicate ? " · dup" : ""),
      ),
    );

  function CoverPicker(props) {
    const scope = read(props.field, ["scope"]) === "trip" ? "trip" : "visit";
    const key = entryKey(props.entry, scope);
    const [state, setState] = React.useState({ status: "loading", photos: [] });
    React.useEffect(() => {
      let live = true;
      loadIndex()
        .then((index) => live && setState({ status: "ready", photos: (scope === "trip" ? index.trips : index.visits)[key] ?? [] }))
        .catch((err) => {
          indexPromise = null; // let the next open try again
          if (live) setState({ status: "error", photos: [], message: err.message });
        });
      return () => {
        live = false;
      };
    }, [key, scope]);

    const value = props.value ?? "";
    const pick = (file) => props.onChange(file === value ? "" : file);
    const note = (text) => h("p", { style: { margin: "6px 0", fontSize: 13, color: "#555" } }, text);
    return h(
      "div",
      { id: props.forID },
      state.status === "loading" ? note("Loading photos…") : null,
      state.status === "error" ? note(`Couldn't load the photo list (${state.message}). You can still type a name below.`) : null,
      state.status === "ready" && state.photos.length === 0 ? note("No photos for this one yet. Add them to the media folder, then run npm run media.") : null,
      state.photos.length > 0
        ? h(
            "div",
            { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, maxHeight: 420, overflowY: "auto", padding: 2 } },
            state.photos.map((p) => tile(p, p.file === value, pick)),
          )
        : null,
      state.photos.length > 0 ? note("Click a photo to make it the cover; click it again to clear. Faded ones are hidden or duplicates.") : null,
      h("input", {
        type: "text",
        value,
        placeholder: scope === "trip" ? "city/photos/img-1234 (blank = first stop's cover)" : "photos/img-1234 (blank = first photo)",
        onChange: (e) => props.onChange(e.target.value),
        style: { width: "100%", marginTop: 6, padding: "6px 8px", font: "13px ui-monospace, Menlo, monospace", boxSizing: "border-box" },
      }),
    );
  }

  CMS.registerWidget("cover-picker", CoverPicker);

  // "focus-picker" field: shows the chosen cover large; click (or drag) on the part that must stay in view.
  // Saves "x% y%", and previews how the trip header and card will crop with it.
  const FRAMES = [
    { label: "Trip header", ratio: "16 / 9" },
    { label: "Card", ratio: "16 / 10" },
    { label: "Phone header", ratio: "16 / 7" },
  ];
  const parse = (v) => {
    const m = String(v ?? "").match(/^(\d+)% (\d+)%$/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  };
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  function FocusPicker(props) {
    const scope = read(props.field, ["scope"]) === "trip" ? "trip" : "visit";
    const key = entryKey(props.entry, scope);
    const cover = String(read(props.entry, ["data", "cover"]) ?? "");
    const [photos, setPhotos] = React.useState(null);
    const [error, setError] = React.useState(null);
    const dragging = React.useRef(false);
    React.useEffect(() => {
      let live = true;
      loadIndex()
        .then((index) => live && setPhotos((scope === "trip" ? index.trips : index.visits)[key] ?? []))
        .catch((err) => {
          indexPromise = null;
          if (live) setError(err.message);
        });
      return () => {
        live = false;
      };
    }, [key, scope]);

    const note = (text) => h("p", { style: { margin: "6px 0", fontSize: 13, color: "#555" } }, text);
    if (error) return note(`Couldn't load the photo list (${error}).`);
    if (!photos) return note("Loading…");
    // No cover picked: the site uses the first photo, so frame that one.
    const photo = photos.find((p) => p.file === cover) ?? (cover ? null : photos.find((p) => !p.hidden && !p.duplicate));
    if (!photo) return note(cover ? "Couldn't find the cover photo. Pick it again above." : "No photos yet.");

    const chosen = parse(props.value);
    const point = chosen ?? photo.focus ?? { x: 50, y: 50 };
    const setFrom = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      props.onChange(`${clamp(((e.clientX - r.left) / r.width) * 100)}% ${clamp(((e.clientY - r.top) / r.height) * 100)}%`);
    };
    const position = `${point.x}% ${point.y}%`;
    return h(
      "div",
      { id: props.forID },
      note(chosen ? "Your framing. Click or drag on the photo to move it." : photo.focus ? "Framed automatically (on faces when it finds them). Click or drag on the photo to choose yourself." : "Click or drag on the photo to choose what stays in view."),
      h(
        "div",
        {
          role: "button",
          tabIndex: 0,
          "aria-label": "Click the part of the photo to keep in view",
          onPointerDown: (e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setFrom(e);
          },
          onPointerMove: (e) => dragging.current && setFrom(e),
          onPointerUp: () => (dragging.current = false),
          style: { position: "relative", maxWidth: 420, cursor: "crosshair", touchAction: "none", userSelect: "none", lineHeight: 0 },
        },
        h("img", {
          src: photo.preview,
          alt: "",
          draggable: false,
          onError: (e) => {
            if (photo.placeholder && e.currentTarget.src !== photo.placeholder) e.currentTarget.src = photo.placeholder;
          },
          style: { width: "100%", display: "block", borderRadius: 6 },
        }),
        h("span", {
          style: {
            position: "absolute", left: `${point.x}%`, top: `${point.y}%`, width: 26, height: 26, margin: "-13px 0 0 -13px",
            borderRadius: "50%", border: "3px solid #fff", boxShadow: "0 0 0 2px #2541b2, 0 2px 8px rgba(0,0,0,.5)", pointerEvents: "none",
          },
        }),
      ),
      h(
        "div",
        { style: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 } },
        FRAMES.map((f) =>
          h(
            "figure",
            { key: f.label, style: { margin: 0, width: 150 } },
            h("img", { src: photo.preview, alt: "", style: { width: "100%", aspectRatio: f.ratio, objectFit: "cover", objectPosition: position, display: "block", borderRadius: 4, background: "#eee" } }),
            h("figcaption", { style: { fontSize: 11, color: "#555", marginTop: 3 } }, f.label),
          ),
        ),
      ),
      chosen
        ? h("button", { type: "button", onClick: () => props.onChange(""), style: { marginTop: 8, fontSize: 13 } }, "Reset to automatic")
        : null,
    );
  }

  CMS.registerWidget("focus-picker", FocusPicker);

  // "media-manager" field: every photo and clip of a visit in one grid. Drag (or use the arrows) to reorder,
  // hide/show, delete (the original is kept in a recovery folder), rotate/crop photos and trim clips. Saves
  // plain lines in the format of src/lib/content/photo-edits.ts; rotate, crop and trim are baked into the
  // web copies the next time photos are processed. Hide, delete and order apply on the next site build.
  const MIN_CROP = 5;
  const MIN_TRIM = 0.5;
  const keyOf = (f) => (f.includes("/") ? f : `photos/${f}`);
  const parseEdits = (text) => {
    const edits = {};
    let order = [];
    for (const raw of String(text ?? "").split("\n")) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      if (line.startsWith("order:")) {
        order = line.slice(6).split(",").map((x) => x.trim()).filter(Boolean).map(keyOf);
        continue;
      }
      const [file, ...parts] = line.split(/\s+/);
      const e = {};
      for (const p of parts) {
        const [k, v = ""] = p.split("=");
        const n = v.split(",").map(Number);
        if (k === "rotate" && ["90", "180", "270"].includes(v)) e.rotate = Number(v);
        else if (k === "crop" && n.length === 4 && n.every(Number.isFinite)) e.crop = { x: n[0], y: n[1], w: n[2], h: n[3] };
        else if (k === "trim" && n.length === 2 && n.every(Number.isFinite)) e.trim = { start: n[0], end: n[1] };
        else if (k === "hide") e.hide = true;
        else if (k === "delete") e.delete = true;
      }
      edits[keyOf(file)] = e;
    }
    return { edits, order };
  };
  const r1 = (n) => Math.round(n * 10) / 10;
  const formatEdits = ({ edits, order }) => {
    const lines = Object.keys(edits)
      .sort()
      .map((f) => {
        const e = edits[f];
        const bits = [
          e.rotate ? `rotate=${e.rotate}` : "",
          e.crop ? `crop=${[e.crop.x, e.crop.y, e.crop.w, e.crop.h].map(r1).join(",")}` : "",
          e.trim ? `trim=${r1(e.trim.start)},${r1(e.trim.end)}` : "",
          e.hide ? "hide" : "",
          e.delete ? "delete" : "",
        ].filter(Boolean);
        return bits.length ? [f, ...bits].join(" ") : "";
      })
      .filter(Boolean);
    return [order.length ? `order: ${order.join(", ")}` : "", ...lines].filter(Boolean).join("\n");
  };
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function CropCanvas({ photo, edit, onEdit }) {
    const canvasRef = React.useRef(null);
    const drag = React.useRef(null);
    const [ratio, setRatio] = React.useState(null);
    const rotate = edit.rotate ?? 0;
    // Draw the working copy turned by `rotate`, so the crop box is in the same frame the site will use.
    React.useEffect(() => {
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        if (!c) return;
        const turned = rotate === 90 || rotate === 270;
        const w = turned ? img.naturalHeight : img.naturalWidth, hgt = turned ? img.naturalWidth : img.naturalHeight;
        c.width = w;
        c.height = hgt;
        const ctx = c.getContext("2d");
        ctx.save();
        ctx.translate(w / 2, hgt / 2);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.restore();
        setRatio(w / hgt);
      };
      img.onerror = () => setRatio(-1);
      img.src = photo.edit;
    }, [photo.edit, rotate]);

    const crop = edit.crop ?? { x: 0, y: 0, w: 100, h: 100 };
    const pct = (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
    };
    const setCrop = (c) => {
      const full = c.x <= 0 && c.y <= 0 && c.w >= 100 && c.h >= 100;
      onEdit({ ...edit, crop: full ? undefined : c });
    };
    const onDown = (e, mode) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { mode, start: pct(e), crop: { ...crop } };
    };
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      const p = pct(e);
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      const c = { ...d.crop };
      if (d.mode === "new") {
        Object.assign(c, { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) });
      } else if (d.mode === "move") {
        c.x = Math.max(0, Math.min(100 - c.w, d.crop.x + dx));
        c.y = Math.max(0, Math.min(100 - c.h, d.crop.y + dy));
      } else {
        // Corner handles: "nw", "ne", "sw", "se" move the matching edges.
        if (d.mode.includes("w")) { c.x = Math.min(d.crop.x + d.crop.w - MIN_CROP, Math.max(0, d.crop.x + dx)); c.w = d.crop.x + d.crop.w - c.x; }
        if (d.mode.includes("e")) c.w = Math.max(MIN_CROP, Math.min(100 - d.crop.x, d.crop.w + dx));
        if (d.mode.includes("n")) { c.y = Math.min(d.crop.y + d.crop.h - MIN_CROP, Math.max(0, d.crop.y + dy)); c.h = d.crop.y + d.crop.h - c.y; }
        if (d.mode.includes("s")) c.h = Math.max(MIN_CROP, Math.min(100 - d.crop.y, d.crop.h + dy));
      }
      if (c.w >= MIN_CROP && c.h >= MIN_CROP) setCrop(c);
    };
    const onUp = () => (drag.current = null);
    const handle = (mode, pos) =>
      h("span", {
        key: mode,
        onPointerDown: (e) => onDown(e, mode),
        style: { position: "absolute", width: 16, height: 16, background: "#fff", border: "2px solid #2541b2", borderRadius: 3, cursor: `${mode}-resize`, ...pos },
      });

    if (ratio === -1) return h("p", { style: { fontSize: 13, color: "#a33" } }, "Couldn't load this photo's working copy. Process the photos again, then reopen.");
    return h(
      "div",
      // overflow: hidden keeps the dimmed area outside the crop box on the photo, not the whole page.
      { style: { position: "relative", maxWidth: 520, overflow: "hidden", borderRadius: 6, touchAction: "none", userSelect: "none", lineHeight: 0 }, onPointerDown: (e) => onDown(e, "new"), onPointerMove: onMove, onPointerUp: onUp },
      h("canvas", { ref: canvasRef, style: { width: "100%", display: "block", borderRadius: 6, background: "#ddd", aspectRatio: ratio ? String(ratio) : "4 / 3", cursor: "crosshair" } }),
      ratio && edit.crop
        ? h(
            "div",
            {
              onPointerDown: (e) => onDown(e, "move"),
              style: {
                position: "absolute", left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,.45)", outline: "2px solid #fff", cursor: "move",
              },
            },
            handle("nw", { left: 0, top: 0 }),
            handle("ne", { right: 0, top: 0 }),
            handle("sw", { left: 0, bottom: 0 }),
            handle("se", { right: 0, bottom: 0 }),
          )
        : null,
    );
  }


  function TrimEditor({ item, edit, onEdit }) {
    const videoRef = React.useRef(null);
    const stopAt = React.useRef(null);
    const [duration, setDuration] = React.useState(item.duration ?? 0);
    const trim = edit.trim ?? { start: 0, end: duration };
    const set = (start, end) => {
      const s = Math.max(0, Math.min(start, duration - MIN_TRIM)), e = Math.max(s + MIN_TRIM, Math.min(end, duration));
      const whole = s <= 0.05 && e >= duration - 0.05;
      onEdit({ ...edit, trim: whole ? undefined : { start: r1(s), end: r1(e) } });
    };
    const seek = (t) => videoRef.current && (videoRef.current.currentTime = t);
    const playSelection = () => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = trim.start;
      stopAt.current = trim.end;
      v.play();
    };
    const slider = (label, value, onChange) =>
      h(
        "label",
        { style: { display: "grid", gridTemplateColumns: "56px minmax(0, 1fr) 52px", alignItems: "center", gap: 8, fontSize: 13, margin: "6px 0" } },
        label,
        h("input", { type: "range", min: 0, max: duration || 1, step: 0.1, value, onChange: (e) => onChange(Number(e.target.value)), "aria-label": `${label} (seconds)` }),
        h("span", { style: { fontFamily: "ui-monospace, Menlo, monospace" } }, `${r1(value)}s`),
      );
    return h(
      "div",
      { style: { maxWidth: 520 } },
      h("video", {
        ref: videoRef,
        src: item.edit,
        controls: true,
        playsInline: true,
        preload: "metadata",
        onLoadedMetadata: (e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration),
        onTimeUpdate: (e) => {
          if (stopAt.current !== null && e.currentTarget.currentTime >= stopAt.current) {
            e.currentTarget.pause();
            stopAt.current = null;
          }
        },
        style: { width: "100%", maxHeight: 360, background: "#000", borderRadius: 6, display: "block" },
      }),
      duration
        ? h(
            "div",
            null,
            slider("Start", trim.start, (v) => (set(v, trim.end), seek(v))),
            slider("End", trim.end, (v) => (set(trim.start, v), seek(v))),
            h("p", { style: { fontSize: 13, color: "#555", margin: "4px 0" } }, `Keeps ${r1(trim.end - trim.start)}s of ${r1(duration)}s.${item.tooLarge ? " This clip is too big to publish as it is; trim it to about 30 seconds or less." : ""}`),
            h("button", { type: "button", onClick: playSelection, style: { fontSize: 13, padding: "4px 10px", marginRight: 6 } }, "▶ Play the kept part"),
            edit.trim ? h("button", { type: "button", onClick: () => onEdit({ ...edit, trim: undefined }), style: { fontSize: 13, padding: "4px 10px" } }, "Reset trim") : null,
          )
        : h("p", { style: { fontSize: 13, color: "#555" } }, "Loading the clip…"),
    );
  }

  function MediaManager(props) {
    const key = entryKey(props.entry, "visit");
    const [all, setAll] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [selected, setSelected] = React.useState(null);
    const dragFrom = React.useRef(null);
    React.useEffect(() => {
      let live = true;
      loadIndex()
        .then((index) => live && setAll(index.media?.[key] ?? []))
        .catch((err) => {
          indexPromise = null;
          if (live) setError(err.message);
        });
      return () => {
        live = false;
      };
    }, [key]);

    const state = parseEdits(props.value);
    const note = (text) => h("p", { style: { margin: "6px 0", fontSize: 13, color: "#555" } }, text);
    if (error) return note(`Couldn't load the photos and clips (${error}).`);
    if (!all) return note("Loading…");
    if (!all.length) return note("No photos or clips for this visit yet. Upload some first.");

    const save = (next) => props.onChange(formatEdits(next));
    const editOf = (f) => state.edits[f] ?? {};
    const setEdit = (f, e) => save({ ...state, edits: { ...state.edits, [f]: e } });
    // Display order: the saved order first, then everything else oldest first (as the site does).
    const rank = new Map(state.order.map((f, i) => [f, i]));
    const items = [...all].sort((a, b) => (rank.get(a.file) ?? Infinity) - (rank.get(b.file) ?? Infinity));
    const visible = items.filter((i) => !editOf(i.file).delete);
    const deleted = items.filter((i) => editOf(i.file).delete);
    const move = (from, to) => {
      if (to < 0 || to >= visible.length || from === to) return;
      const files = visible.map((i) => i.file);
      const [f] = files.splice(from, 1);
      files.splice(to, 0, f);
      save({ ...state, order: files });
    };
    const btn = (label, onClick, title, extra = {}) =>
      h("button", { type: "button", title, "aria-label": title, onClick: (e) => (e.stopPropagation(), onClick()), style: { minWidth: 30, minHeight: 30, padding: "0 6px", fontSize: 13, border: "1px solid #bbb", borderRadius: 6, background: "#fff", cursor: "pointer", flex: "0 0 auto", ...extra } }, label);
    const badge = (text, bg = "rgba(0,0,0,.65)") => h("span", { key: text, style: { background: bg, color: "#fff", font: "10px ui-monospace, Menlo, monospace", padding: "1px 5px", borderRadius: 3 } }, text);
    const sel = items.find((i) => i.file === selected);

    return h(
      "div",
      { id: props.forID },
      note(`${visible.filter((i) => i.kind === "photo").length} photos · ${visible.filter((i) => i.kind === "video").length} clips. Drag to reorder (or use the arrows), tap one to rotate, crop or trim.`),
      state.order.length ? btn("Reset to date order", () => save({ ...state, order: [] }), "Reset to date order", { marginBottom: 8, width: "auto" }) : null,
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 } },
        visible.map((item, index) => {
          const e = editOf(item.file);
          const hidden = e.hide || item.hidden;
          return h(
            "div",
            {
              key: item.file,
              draggable: true,
              onDragStart: () => (dragFrom.current = index),
              onDragOver: (ev) => ev.preventDefault(),
              onDrop: (ev) => {
                ev.preventDefault();
                if (dragFrom.current !== null) move(dragFrom.current, index);
                dragFrom.current = null;
              },
              onClick: () => setSelected(item.file === selected ? null : item.file),
              role: "button",
              tabIndex: 0,
              onKeyDown: (ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), setSelected(item.file === selected ? null : item.file)),
              "aria-label": `${item.kind === "video" ? "Clip" : "Photo"} ${index + 1}: ${item.file}${hidden ? " (hidden)" : ""}`,
              style: { border: item.file === selected ? "3px solid #2541b2" : "1px solid #ccc", borderRadius: 8, overflow: "hidden", background: "#fff", cursor: "grab" },
            },
            h(
              "div",
              { style: { position: "relative", aspectRatio: "1", background: "#222" } },
              h("img", {
                src: item.thumb,
                alt: "",
                loading: "lazy",
                draggable: false,
                onError: (ev) => item.placeholder && ev.currentTarget.src !== item.placeholder && (ev.currentTarget.src = item.placeholder),
                style: { width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: hidden || item.duplicate ? 0.4 : 1, transform: e.rotate ? `rotate(${e.rotate}deg)` : undefined },
              }),
              h(
                "div",
                { style: { position: "absolute", top: 4, left: 4, right: 4, display: "flex", flexWrap: "wrap", gap: 3 } },
                item.kind === "video" ? badge(`▶ ${item.duration ? clock(e.trim ? e.trim.end - e.trim.start : item.duration) : ""}`) : null,
                hidden ? badge("hidden", "#555") : null,
                item.tooLarge && !e.trim ? badge("too long: trim", "#b3261e") : null,
                item.duplicate ? badge("duplicate", "#555") : null,
                e.rotate || e.crop || e.trim ? badge("edited", "#2541b2") : null,
              ),
            ),
            h(
              "div",
              { style: { display: "flex", gap: 4, padding: 4, justifyContent: "space-between" } },
              btn("←", () => move(index, index - 1), "Move earlier"),
              btn(hidden ? "Show" : "Hide", () => setEdit(item.file, { ...e, hide: !e.hide || undefined }), hidden ? "Show on the site" : "Hide from the site", { flex: "1 1 auto" }),
              btn("✕", () => window.confirm(`Delete this ${item.kind}? It comes off the site, and the original is kept in a recovery folder.`) && setEdit(item.file, { ...e, delete: true }), "Delete", { color: "#b3261e" }),
              btn("→", () => move(index, index + 1), "Move later"),
            ),
          );
        }),
      ),
      item_hint(sel),
      deleted.length
        ? h(
            "div",
            { style: { marginTop: 12, fontSize: 13 } },
            h("b", null, `Deleted (${deleted.length}) `),
            deleted.map((item) => h("span", { key: item.file, style: { marginRight: 8 } }, `${item.file} `, btn("Undo", () => setEdit(item.file, { ...editOf(item.file), delete: undefined }), "Undo delete", { width: "auto" }))),
          )
        : null,
    );

    function item_hint(item) {
      if (!item || editOf(item.file).delete) return null;
      const e = editOf(item.file);
      return h(
        "div",
        { style: { marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8, background: "#fafafa" } },
        h("b", { style: { display: "block", marginBottom: 8 } }, item.file),
        item.kind === "video"
          ? h(TrimEditor, { item, edit: e, onEdit: (next) => setEdit(item.file, next) })
          : h(
              "div",
              null,
              h(
                "div",
                { style: { marginBottom: 8 } },
                // Turning changes the frame, so any crop is cleared rather than silently moved.
                btn("⟲ Rotate left", () => setEdit(item.file, { ...e, crop: undefined, rotate: ((e.rotate ?? 0) + 270) % 360 || undefined }), "Rotate left", { width: "auto", marginRight: 6 }),
                btn("⟳ Rotate right", () => setEdit(item.file, { ...e, crop: undefined, rotate: ((e.rotate ?? 0) + 90) % 360 || undefined }), "Rotate right", { width: "auto", marginRight: 6 }),
                e.rotate || e.crop ? btn("Reset", () => setEdit(item.file, { ...e, rotate: undefined, crop: undefined }), "Reset rotate and crop", { width: "auto" }) : null,
              ),
              h(CropCanvas, { photo: item, edit: e, onEdit: (next) => setEdit(item.file, next) }),
              note(e.crop ? "Drag the box to move it, the corners to resize, or outside it to draw a new one." : "Drag across the photo to draw a crop box."),
            ),
      );
    }
  }

  CMS.registerWidget("media-manager", MediaManager);
  // Older configs named the field's widget "photo-editor".
  CMS.registerWidget("photo-editor", MediaManager);
})();
