// Adds a "Site metrics" button to the editor's toolbar (shown after signing in). It opens
// /admin/metrics/ in a new tab; the page can't be embedded because /admin/* forbids framing.
if (window.CMS && typeof window.CMS.registerCustomPage === "function") {
  window.CMS.registerCustomPage({ id: "metrics", label: "Site metrics", icon: "monitoring", url: "/admin/metrics/", newTab: true });
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
})();
