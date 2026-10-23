# Kop On! website

The website for the **Kop On!** Liverpool FC podcast. It builds itself from the
podcast's RSS feed and runs on Netlify.

- **Home**: the latest episode with a real audio player, recent episodes, live LFC headlines and the community link
- **Episode pages** (`/episodes/<name>/`): player with skip back and forward, playback speed and resume-where-you-left-off; show notes where timestamps like `12:34` are clickable; a discussion thread for every episode
- **All episodes** (`/episodes/`): instant search
- **Latest LFC news** (`/news/`): headlines from This Is Anfield, the Liverpool Echo, Empire of the Kop, The Anfield Wrap and Anfield Online, refreshed automatically
- **Community** (`/community/`): forum rooms plus the episode threads
- **YouTube Shorts**: clips from your channel appear automatically on the episode they were posted after
- **Automatic updates**: publish an episode on Spotify for Creators and the site rebuilds itself within about 15 minutes

All the old episode addresses (for example `/episodes/rio-the-hero/`) still work.

---

## One-time setup (about 15 minutes)

### 1. Put the code on GitHub

Netlify needs the code in a Git repository to rebuild the site by itself.

1. Create a free account at <https://github.com> and click **New repository**. Name it, for example, `kop-on-website`, and choose **Private**.
2. On the new repository's page, click **uploading an existing file**. Drag in **everything inside** this folder (not the folder itself; about 50 files), then click **Commit changes**. If you've built the site on your computer, leave out any `dist` folder: Netlify makes its own.

### 2. Connect it to your Netlify site

1. In Netlify, open your site (**kop-on-podcast**).
2. Go to **Site configuration (called "Project configuration" in newer Netlify) → Build & deploy → Continuous deployment → Link repository** and pick the GitHub repository.
3. Netlify reads the build settings from `netlify.toml`. If it asks, use build command `npm run build` and publish directory `dist`.
4. Click **Deploy**. After a minute or so the new site is live.

### 3. Turn on automatic rebuilds

1. In Netlify, go to **Site configuration → Build & deploy → Continuous deployment → Build hooks → Add build hook**. Name it `New episode`, choose your main branch and save. Copy the URL it gives you.
2. Go to **Site configuration → Environment variables → Add a variable**. Set the key to `BUILD_HOOK_URL` and paste the URL as the value.
3. Go to **Deploys → Trigger deploy → Deploy site** so the change takes effect.

From then on, a small scheduled function (`check-new-episode`) looks at your podcast feed every 15 minutes:

- **New episode:** it rebuilds the site straight away.
- **Edited episode** (title, notes and so on): it rebuilds within 3 hours.
- **Otherwise:** it rebuilds about once a day, to keep the built-in headlines fresh.

If builds ever keep failing, it backs off to **at most 8 builds a day** (plus up to 3 on the day a new episode comes out), so it can't burn through your free build minutes.

To check it's working, open **Logs → Functions → check-new-episode** in Netlify to see what it decided, or click **Run now**.

### 4. Switch on comments and the forum (free, with Disqus)

Until you do this, discussion areas show a friendly "opens soon" panel.

1. Go to <https://disqus.com>, click **Get started**, then **I want to install Disqus on my site**.
2. Set **Website Name** to `koponpodcast` (or similar). This becomes your *shortname*. Pick any category, then choose the free **Basic** plan.
3. On the platform list, skip to the bottom and choose **I don't see my platform listed** (or **Universal Code**). You don't need to paste any code, because the site already has it. Finish the setup.
4. In Disqus, go to **Settings → General**. Check the **Shortname** and set **Website URL** to `https://koponpodcast.com`. Under **Settings → Advanced**, add `koponpodcast.com` to **Trusted Domains**.
5. In Netlify, add an environment variable: `DISQUS_SHORTNAME` = your shortname. Then go to **Deploys → Trigger deploy**.

Visitors can sign in with Google, Facebook, X or a Disqus account, or post as guests if you allow it in Disqus's settings. You moderate from disqus.com or the Disqus app. The free plan shows Disqus adverts and uses tracking cookies, so the site asks visitors to press **Show the discussion** first and remembers their choice.

**Alternatives:** Cusdis (free, no ads, no logins, up to 100 approved comments a month: set `CUSDIS_APP_ID`) or Hyvor Talk (paid, no ads: set `HYVOR_WEBSITE_ID`).

Every episode gets its own thread automatically. The forum rooms (The Terrace, Transfer Talk, Matchday) are set in `site.config.mjs`.

---

## YouTube Shorts

Post a Short on the Kop On YouTube channel and it appears on the episode page within about 3 hours. It goes on the newest episode released before the Short, and teasers posted up to 12 hours before an episode count towards that episode. Nothing loads from YouTube until a visitor presses play.

To put a Short on a different episode, or hide one, edit `youtube` in `site.config.mjs`:

```js
extraShorts: { 'Rio the Hero!': ['https://youtube.com/shorts/abcdefghijk'] },
hideShorts: ['https://youtube.com/shorts/zyxwvutsrqp'],
```

## Changing things

Almost everything you'd want to change is in **`site.config.mjs`**:

| What | Setting |
| --- | --- |
| The "Welcome to Kop On!" text | `welcome` |
| Podcast app links (Spotify, Apple…) | `listen`; `featured: true` shows it as a button |
| Patreon link | `patreon` |
| Forum rooms | `rooms` |
| YouTube channel, Shorts per episode | `youtube` |
| The site's main address | `siteUrl` |
| News sites | `news.sources` (each can have backup URLs) |
| How often the site refreshes without new episodes | `refreshHours` |

Edit the file on GitHub (click it, then the pencil icon) and commit. Netlify rebuilds automatically.

The logo files are in `src/assets/img/`, colours and fonts are in `src/assets/site.css`, and page layouts are in `src/templates.mjs`.

## Checking the news feeds

Open `https://koponpodcast.com/api/news`. Under `sources`, each site shows `"ok": true` and a headline count, or the error it hit. If a site changes its feed address, update its URL in `site.config.mjs`. The page carries on with the other sites in the meantime.

## How it works

```
Spotify for Creators RSS feed ──► npm run build ──► static pages in dist/ ──► Netlify
          ▲                                                  │
          │                                                  ▼
check-new-episode (every 15 min) ─► build hook        /api/news (live headlines,
   compares feed with /site-status.json                 cached for 15 minutes)
```

- There are no npm packages to install or keep updated. The feed reader, the show-notes cleaner (which strips anything unsafe) and the news merger are all in `lib/`.
- Headlines are built into the pages, so they show instantly, and are then refreshed live from `/api/news`.
- If the podcast feed can't be downloaded, the build stops and Netlify keeps the current site online. It never publishes an empty site.

## Working on it locally (optional)

Needs Node.js 18 or newer.

```bash
npm run build      # builds dist/ from the live feed
npm run dev        # preview at http://localhost:8888
npm test           # unit tests
python3 test/browser_test.py   # full browser tests (needs: pip install playwright)
```

To preview offline with the test data: `node test/build-fixture-site.mjs --port 8888 && node scripts/dev-server.mjs --fixtures --port 8888`.
