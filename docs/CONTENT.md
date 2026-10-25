# Adding and editing content

Everything on the site comes from files in `content/`. You never need to touch the code in `src/`.
There are two ways to edit: the **editor** (forms in your browser) or the **files** directly. Both
change the same files.

## The editor

1. `npm run dev`
2. In **Chrome**, open <http://localhost:3000/admin/index.html>
3. Click **Work with Local Repository** and choose the `portfolio` folder.
4. Edit, then check the result at <http://localhost:3000>. Commit when you're happy
   (`git add -A && git commit -m "…"`), or turn on *Settings → Developer → Commit Changes to Git*.

Once the site is on GitHub you can also use the editor at `https://johnojo.me/admin/index.html` and
sign in with GitHub. Only accounts with write access to the repository can save; visitors can't.

## Add a new trip (e.g. Europe 2027)

1. **Places**: add any city that isn't listed yet (name, country, and the city centre's latitude and
   longitude from a map. Leave them blank for a region and it simply won't get a map pin).
2. **Trips → New Trip**: title `Europe 2027`, year, status **Draft** while you're working on it.
3. **City visits → New City visit**, once per stop: pick the trip and place, set the stop number
   (1, 2, 3…) and the type (*City visit*, *Match day only* or *Day trip*).
4. Drop photos into `~/workspace/johnojo-media/europe-2027/<city>/photos` and run `npm run media`
   (see [MEDIA.md](MEDIA.md)).
5. Set the trip to **Published** when it's ready.

The trip list, timeline, map, rankings, home page and search update automatically.
Never publish a trip while you're still on it; the site doesn't show where you are right now.

## Write about a city

Open its **City visit**:

- **What I did**: a few lines in your own words.
- **Highlights**: label + text (Food, Football, Architecture…).
- **Liked / Didn't like / Would I return? / One-line verdict**.
- **Scores**: ten categories from 0 to 10. Leave any you're unsure about blank. A city is only ranked
  once all ten are filled in; a blank is never counted as zero.

## Add a match

In the visit, **Matches → Add**: home, away, final score, competition, stadium, date and your write-up.
Not sure of the fixture? Leave it to Claude: it reads the photo dates and looks it up.

## Visited the same city again?

Create a new **City visit** for the new trip. Each visit keeps its own scores, photos and story, and
the rankings' *Then vs now* view compares them.

## Journal posts

**Journal → New Post**. Write in Markdown (`## Heading`, `**bold**`, `*italic*`, blank line between
paragraphs). Extras:

| You type | You get |
|---|---|
| `<Scripture k="Hebrews 11:8-10" />` | The full passage (World English Bible) with a link |
| `<Ref k="Genesis 12:1">Genesis 12:1</Ref>` | An inline reference that opens the passage in the side panel |
| `<Fn n={1} />` | Footnote 1 from the post's *Footnotes* list |
| `<Pull>Text</Pull>` | A large pull quote |

A passage must be added to `src/lib/scripture.ts` once before it can be used (public-domain WEB text
only; newer translations like NIV/ESV have quotation limits, so link to those instead).
Keep **Who can read it** on *Public*: other tiers are reserved for future memberships and aren't built.

## Résumé, links and career

**About me and career**:
- *About me and links*: home-page introduction, LinkedIn, public email, and **Résumé PDF** (upload the
  approved file; the résumé buttons start working straight away).
- *Career timeline and skills*: add a milestone for each promotion or new role.

## Projects

**Projects**: Drafts are only visible locally. Set **Published** once you're happy with the wording.

## What's still missing?

`npm run status` lists, for every trip and city, the notes, scores, match answers, photos and videos
that are still to do.

## Draft vs published

| | `npm run dev` | Live site |
|---|---|---|
| Draft | shown, with a "Draft" label | hidden |
| Published | shown | shown |

To preview a production build with drafts: `SHOW_DRAFTS=1 npm run build && npm start`.
