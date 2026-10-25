# Adding and editing content

Everything on the site comes from files in `content/`. You never need to touch the code in `src/`.
There are two ways to edit: the **editor** (forms in your browser) or the **files** directly. Both
change the same files.

## The editor

### On your computer (no login)

1. `npm run dev`
2. In **Chrome**, open <http://localhost:3000/admin/>
3. Click **Work with Local Repository** and choose the `portfolio` folder (the editor calls it by the
   GitHub name, `johnojo-me`; it's the same project).
4. Edit and save, then check the result at <http://localhost:3000>. Saving writes the files on your disk;
   commit when you're happy (`git add -A && git commit -m "…"`).

This needs no login because nothing leaves your machine.

### Online, once the site is deployed

Open `https://johnojo.me/admin/`. Cloudflare first asks for your email and a one-time PIN (only your
address is allowed), then the editor asks you to sign in to GitHub, with a token or the
**Sign in with GitHub** button. Only your GitHub account can save, because the repository is private
and you're its only collaborator. Every save is a commit to `main`, and the site rebuilds in a minute
or two. Setup steps: [DEPLOY.md](DEPLOY.md), "The editor online".

### Draft vs published

- **Draft**: you see it on your computer (`npm run dev`, with a "Draft" label). The live site leaves it
  out completely: no page, no link, no search result.
- **Published**: live for everyone after the next build.
- Trips also have **Coming soon**, which currently behaves like Published.

Keep a trip on Draft while you're still travelling; the site never shows where you are right now.

### Add a trip

1. **Places**: add any city that isn't listed yet (city, country, and the city centre's latitude and
   longitude from a map. Leave them blank for a region and it simply won't get a map pin).
2. **Trips → New Trip**: title (e.g. `Europe 2027`; the web address is made from it on the first save),
   year, status **Draft**. Dates, theme and introduction can wait.
3. Save. The trip list, timeline, map, rankings, home page and search update automatically.

### Add a city visit

1. **City visits → New City visit**.
2. Pick the **Trip** and the **Place**, and set the **Stop number** (1 for the first city, 2 for the
   next…). Leave *Type of stop* blank for a normal city, or choose *Match day only* or *Day trip*.
3. Fill in what you have: *What I did*, *Highlights* (a label like Food on the left, a short line on the
   right), *Liked*, *Didn't like*, *Would I return?*, *One-line verdict*, and any *Matches*.
4. Save. The file is named after the trip and place, e.g. `europe-2027--porto.yaml`.
5. Photos: drop them into `~/workspace/johnojo-media/europe-2027/<city>/photos` and run `npm run media`
   (see [MEDIA.md](MEDIA.md)).

### Scores

Open the visit, click **Scores**, and fill in the ten categories with whole numbers from 0 to 10.
Leave any you're unsure about blank: a blank is never counted as zero, and a city joins the rankings
once all ten are filled in. *Rated on* is the date you scored it.

### Hide a photo, or caption it

Open the visit → **Photo captions and hiding** → add a row. In *Photo or clip* type its name without the
extension, e.g. `photos/img-1234` or `videos/img-1234` (`npm run status` and the photo folder show the
names). Then either write a caption and a short description, or switch on **Hide this photo**. The file
stays on disk; it just isn't shown.

### Write a journal post

**Journal → New Post**: title, one-line summary, category, then the text in **Post** (Markdown, see
"Journal posts" below). Keep it on **Draft** until it's ready, then set **Published** with
*Who can read it* on **Public**. The Journal tab only appears on the site once at least one post is
published and public.

### Good to know

- Blank fields are left out of the file, which the site reads as "not filled in yet".
- Saving rewrites the whole file in a standard layout and drops `#` comments in it. The values are kept.
- `npm test` checks the editor against the content rules (`tests/admin-config.test.ts`), so a change to
  the rules that the editor doesn't know about fails the tests instead of breaking a save.

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
- *About me and links*: home-page introduction, LinkedIn, public email, résumé city. Keep
  **Résumé PDF** as `/resume.pdf`: the PDF is made from your career timeline by `npm run resume:pdf`.
- *Career timeline and skills*: a milestone for each promotion or new role, the résumé roles (each with
  sections; *Started* and *Ended* in YYYY-MM drive "pick a year" on the Work page), education and skills.

## Projects

**Projects**: Drafts are only visible locally. Set **Published** once you're happy with the wording.

## What's still missing?

`npm run status` lists, for every trip and city, the notes, scores, match answers, photos and videos
that are still to do.

## Where drafts show

| | `npm run dev` | Live site |
|---|---|---|
| Draft | shown, with a "Draft" label | hidden |
| Published | shown | shown |

To preview a production build with drafts: `SHOW_DRAFTS=1 npm run build && npm start`.

## Keeping your notes in step

`npm run notes:sync` copies everything on the site back into the notes files in `~/workspace/johnojo-media`,
filling only empty sections, so details given in chat or the editor are also kept in your own notes.
