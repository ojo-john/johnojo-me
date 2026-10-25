# johnojo.me

Personal site: **Work** (career, skills, projects), **Travel** (trips, city rankings, match days,
photos) and **Journal** (Bible studies, essays, notes).

Static Next.js 16 site (TypeScript, App Router, `output: "export"`), built for Cloudflare Pages.
Content is YAML/MDX in `content/`, validated with Zod at build time; photos are pre-processed by a
script. No database, no server.

## Commands

| | |
|---|---|
| `npm run dev` | Local site at http://localhost:3000 (drafts shown). Editor at /admin/index.html |
| `npm run media` | Process new photos/videos from `~/workspace/johnojo-media` |
| `npm run status` | What notes, scores, photos and videos are still missing |
| `npm run build` | Production build into `out/` (drafts hidden) |
| `npm start` | Serve `out/` locally |
| `npm run check` | Typecheck, lint and unit tests |

## Guides

- [docs/CONTENT.md](docs/CONTENT.md): adding trips, cities, matches, posts, projects and the résumé
- [docs/MEDIA.md](docs/MEDIA.md): photo and video workflow, privacy and size limits

## Layout

```
content/          trips/<trip>/trip.yaml, visits/<trip>--<city>.yaml, destinations/<place>.yaml,
                  journal/*.mdx, projects/*.yaml, site.yaml, experience.yaml, media-manifest.json
public/admin/     the editor (Sveltia CMS) and its config
scripts/          media.ts (photo pipeline), status.ts (content checklist)
src/app/          pages: / · /work · /travel · /travel/[trip] · /journal · /journal/[slug]
src/components/   page sections and interactive pieces (map explorer, rankings, lightbox…)
src/lib/content/  schemas, loader, ranking maths (+ tests)
```

Rules the code enforces: a city is ranked only when all ten scores exist (a blank is never zero);
drafts and non-public journal posts never reach a production build; map pins only for places with
coordinates; scripture is quoted only from public-domain translations.
