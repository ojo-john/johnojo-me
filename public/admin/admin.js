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
      h("img", { src: photo.thumb, alt: "", loading: "lazy", style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } }),
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
})();
