#!/usr/bin/env python3
"""npm run notes:sync -- copy what is on the site (content/) back into the private notes in the media inbox.

Only empty sections are filled, so nothing typed in notes.md is ever overwritten. Each notes.md and
trip.md also gets an "On the site" section listing dates, type of stop and hidden media.
"""
import os, re, yaml, glob, datetime
INBOX = os.path.expanduser("~/workspace/johnojo-media")
CONTENT = os.path.expanduser("~/workspace/portfolio/content")
LABELS = {"food": "Food & Desserts", "value": "Affordability & Value", "transport": "Public Transportation", "walkability": "Walkability",
          "architecture": "Architecture & Beauty", "culture": "Culture & Atmosphere", "people": "People & Hospitality",
          "attractions": "Attractions & Experiences", "safety": "Safety & Comfort", "enjoyment": "Overall Enjoyment"}
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
PLACEHOLDER = re.compile(r"^\s*(\(.*\)|-\s*[^:]+:\s*|IMG_0001\.jpg \| caption \| alt text.*)\s*$")

def is_empty(body):
    return all(not l.strip() or PLACEHOLDER.match(l) for l in body.splitlines())

def split(md):
    parts = re.split(r"(?m)^(## .*)$", md)
    head, secs = parts[0], []
    for i in range(1, len(parts), 2):
        secs.append([parts[i], parts[i + 1]])
    return head, secs

def find(secs, name):
    return next((s for s in secs if s[0].lower().startswith("## " + name.lower())), None)

changed = []
for vf in sorted(glob.glob(f"{CONTENT}/visits/*.yaml")):
    v = yaml.safe_load(open(vf))
    trip, visit = os.path.basename(vf)[:-5].split("--")
    tdir = os.path.join(INBOX, trip)
    if not os.path.isdir(tdir): continue
    folder = v.get("photoFolder") or next((d for d in os.listdir(tdir) if os.path.isdir(os.path.join(tdir, d)) and slug(d) == visit), None)
    if not folder: continue
    path = os.path.join(tdir, folder, "notes.md")
    md = open(path).read() if os.path.exists(path) else f"# {visit} · {trip}\n"
    head, secs = split(md)
    def fill(name, text):
        if not text: return
        s = find(secs, name)
        if s is None: secs.append([f"## {name}", f"\n{text}\n\n"])
        elif is_empty(s[1]): s[1] = f"\n{text}\n\n"
    fill("What I did", v.get("summary"))
    hl = v.get("highlights") or {}
    if isinstance(hl, list): hl = {h["label"]: h["text"] for h in hl}
    fill("Highlights", "\n".join(f"- {k}: {t}" for k, t in hl.items()))
    fill("Liked", v.get("liked"))
    fill("Didn't like", v.get("disliked"))
    wr = v.get("wouldReturn")
    if wr: fill("Would I return?", wr["answer"].capitalize() + (f". {wr['why']}" if wr.get("why") else ""))
    fill("One-line verdict", v.get("verdict"))
    # scores: fill blank "Category:" lines, or add the block if missing
    scores = ((v.get("rating") or {}).get("scores")) or {}
    if scores:
        s = find(secs, "Scores")
        lines = "\n".join(f"{LABELS[k]}: {scores[k]}" for k in LABELS if scores.get(k) is not None)
        if s is None: secs.append(["## Scores (0–10 each)", f"\n{lines}\n\n"])
        else:
            body = s[1]
            for k, lab in LABELS.items():
                if scores.get(k) is not None:
                    body = re.sub(rf"(?m)^({re.escape(lab)}[^:\n]*:)[ \t]*$", rf"\g<1> {scores[k]}", body)
            s[1] = body
    # matches: the verified fixture and the write-up as it reads on the site
    for m in v.get("matches") or []:
        fixture = f"{m['home']} {m.get('score', 'v')} {m['away']} · {m.get('competition', '')} · {m.get('stadium', '')} · {m.get('date', '')}".replace(" ·  ·", " ·")
        block = f"Fixture (verified): {fixture}\nOn the site: {m.get('writeUp', '')}"
        s = find(secs, "The match")
        if s is None: secs.append(["## The match", f"\n{block}\n\n"])
        elif "Fixture (verified)" not in s[1]:
            s[1] = re.sub(r"Fixture / competition / final score:.*\n", "", s[1])
            s[1] = f"\n{block}\n" + s[1]
    # dates and kind of stop, for the record
    facts = []
    if v.get("arrive"): facts.append(f"Dates: {v['arrive']}" + (f" to {v['depart']}" if v.get("depart") else ""))
    if v.get("kind") and v["kind"] != "city": facts.append(f"Type of stop: {v['kind']}")
    hidden = [k for k, mm in (v.get("mediaMeta") or {}).items() if isinstance(mm, dict) and mm.get("hidden")]
    if hidden: facts.append("Hidden on the site: " + ", ".join(hidden))
    if facts:
        s = find(secs, "On the site")
        text = "\n".join(f"- {f}" for f in facts)
        if s is None: secs.append(["## On the site", f"\n{text}\n\n"])
        else: s[1] = f"\n{text}\n\n"
    out = head + "".join(a + b for a, b in secs)
    if out != md:
        open(path, "w").write(out); changed.append(f"{trip}/{folder}")

# trip-level facts into trip.md
for tf in sorted(glob.glob(f"{CONTENT}/trips/*/trip.yaml")):
    t = yaml.safe_load(open(tf)); trip = os.path.basename(os.path.dirname(tf))
    p = os.path.join(INBOX, trip, "trip.md")
    if not os.path.isdir(os.path.dirname(p)): continue
    md = open(p).read() if os.path.exists(p) else f"# {t['title']}\n"
    lines = [f"- Status: {t['status']}"]
    for k, lab in [("start", "Start"), ("end", "End"), ("datesNote", "Dates"), ("style", "Style"), ("theme", "Theme"), ("intro", "Intro")]:
        if t.get(k): lines.append(f"- {lab}: {t[k]}")
    for k, lab in [("bestMoment", "Best moment"), ("biggestSurprise", "Biggest surprise"), ("wouldChange", "What I'd change"), ("favouriteCity", "Favourite city"), ("wouldRepeat", "Would I repeat it?")]:
        if (t.get("verdict") or {}).get(k): lines.append(f"- {lab}: {t['verdict'][k]}")
    block = "## On the site\n\n" + "\n".join(lines) + "\n"
    md = re.sub(r"(?ms)^## On the site\n.*?(?=^## |\Z)", "", md).rstrip() + "\n\n" + block
    open(p, "w").write(md); changed.append(f"{trip}/trip.md")
print("\n".join(changed))
