# Kop On! website

The website for the **Kop On!** Liverpool FC podcast. It builds itself from the
podcast's RSS feed and runs on Netlify.

- **Home**: the latest episode with a real audio player, recent episodes, live LFC headlines and the community link
- **Episode pages** (`/episodes/<name>/`): player with skip back and forward, playback speed and resume-where-you-left-off; show notes where timestamps like `12:34` are clickable; a discussion thread for every episode
- **All episodes** (`/episodes/`): instant search
- **Latest LFC news** (`/news/`): headlines from 13 sites (BBC Sport, the Guardian, the Athletic, the Liverpool Echo, This Is Anfield and more), with clickbait filtered out, refreshed automatically
- **Top stories**: the five stories most sites are covering, each with a short summary, above the news on the home page and the news page. You can rewrite, hide or pin them at `/editor/`
- **Stats** (`/stats/`): Liverpool's next five matches (each with a preview page: talking points, form, team news, season numbers, head to head and a match thread), recent results, the Premier League and Champions League tables, how Liverpool compare with every Premier League team (including xG), player stats and the league's top scorers
- **Fan zone** (`/fans/`): visitors pick their XI for the next match on a pitch with the players' faces and compare it with the fans' combined XI, with a flip-out tab showing the opposition's predicted line-up. After each match they rate the players out of 10 and pick a player of the match, and you can publish Kop On's official ratings alongside
- **Community** (`/community/`): forum rooms plus the episode threads
- **YouTube Shorts**: clips from your channel appear automatically on the episode they were posted after
- **Automatic updates**: publish an episode on Spotify for Creators and the site rebuilds itself within about 15 minutes

All the old episode addresses (for example `/episodes/rio-the-hero/`) still work.

---

## One-time setup (about 15 minutes)

### 1. Put the code on GitHub

Netlify needs the code in a Git repository to rebuild the site by itself.

1. Create a free account at <https://github.com> and click **New repository**. Name it, for example, `kop-on-website`, and choose **Private**.
2. On the new repository's page, click **uploading an existing file**. Drag in the whole **`kopon-site`** folder, then click **Commit changes**. If you've built the site on your computer, leave out any `dist` folder: Netlify makes its own.

### 2. Connect it to your Netlify site

1. In Netlify, open your site (**kop-on-podcast**).
2. Go to **Site configuration (called "Project configuration" in newer Netlify) → Build & deploy → Continuous deployment → Link repository** and pick the GitHub repository.
3. Set **Base directory** to `kopon-site`. Netlify reads the rest of the build settings from `netlify.toml`. If it asks, use build command `npm run build` and publish directory `dist`.
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

Every episode gets its own thread automatically, and so does every match preview. The forum rooms (The Terrace, Transfer Talk, Matchday) are set in `site.config.mjs`.

### 5. Add your football data keys (for the Stats page)

The Stats page works without any keys, using ESPN's free data. Two keys add more:

| Netlify environment variable | What it adds | Where to get it |
| --- | --- | --- |
| `FOOTBALL_DATA_KEY` | Official Premier League and Champions League tables, and the top scorers | <https://www.football-data.org> (free) |
| `API_FOOTBALL_KEY` | Detailed player stats (key passes, dribbles, tackles, interceptions, duels, ratings) and extra injury news | <https://dashboard.api-football.com> (free: 100 requests a day) |

In Netlify, go to **Site configuration → Environment variables → Add a variable** for each, paste the key as the value, then **Deploys → Trigger deploy**.

**Never paste a key into any file on GitHub**: anyone can read the repository. Environment variables stay private.

If API-Football's free plan doesn't cover the current season, the build log says so and the player table is worked out from ESPN line-ups instead (goals, assists, shots, saves, cards, minutes and a Kop On rating).

### 6. Let yourself edit the top stories (optional)

The top five stories are picked and summarised automatically. To change them from your phone or computer:

1. **Make a GitHub token.** On GitHub, click your picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Name it `Kop On editor`, set **Expiration** to a year, choose **Only select repositories** and pick your website repository. Under **Repository permissions**, set **Contents** to **Read and write**. Click **Generate token** and copy it.
2. **Add three environment variables in Netlify:**
   - `GITHUB_TOKEN`: the token
   - `GITHUB_REPO`: your repository, like `yourname/kop-on-website`
   - `EDITOR_PASSWORD`: a password you choose. Make it long (four or five random words is ideal): it unlocks the top-stories editor and your official ratings. Wrong guesses are limited to 12 an hour.
3. **Trigger a deploy**, then open `https://koponpodcast.com/editor/`.

Type your password and you'll see the five automatic stories. You can rewrite a headline or summary, hide a story, or pin your own (with an expiry time). Press **Save**: the site rebuilds with your changes within about two minutes. Your edits are saved in `content/top-stories.mjs` in the repository.

The editor expects the website files inside a `kopon-site` folder in the repository, which is how you uploaded them. If you ever move them to the top level, add `GITHUB_FILE` = `content/top-stories.mjs`.

---

## The fan zone (`/fans/`)

There's nothing to set up: fans' picks and ratings are saved in **Netlify Blobs**, the storage every Netlify site has built in. On a fan site this size it should stay well within Netlify's free allowance; you can check usage under **Usage & billing** in Netlify.

- **Pick your XI** (`/fans/lineup/`) is always for Liverpool's next match and closes at kick-off. After the match the site moves on to the following one by itself.
- **Player ratings** open for each of the last five matches and close 7 days after the match. The results stay up.
- **Your official ratings:** open any ratings page, scroll to **Kop On's official ratings**, and unlock it with your editor password (`EDITOR_PASSWORD`, the same one as the top-stories editor). Rate the players, add a note if you like, and publish. They appear on a "Kop On" tab for everyone. Once unlocked, that browser tab stays signed in for 12 hours; the page keeps a time-limited pass, never your password.
- **Fair play:** picks are anonymous. Each browser gets one vote per match and can change it until voting closes. No more than six different people can vote from the same internet connection in a day (enough for a house or a pub), and the connection is only stored in scrambled form. Wrong manager passwords lock that connection out for an hour after 8 tries.

**Player photos** are looked up automatically (FotMob first, then TheSportsDB, then Wikipedia) and refreshed every three weeks. A player with no photo shows their initials.
- **Wrong face or no face:** put your own picture in a `photos` folder inside `kopon-site`, named after the player, like `photos/virgil-van-dijk.jpg` (under 2 MB). Your photo always wins.
- **Using a web address instead:** add it to `playerPhotos` in `site.config.mjs`.
- **A note on copyright:** the automatic photos belong to their owners (FotMob's are agency photos). Showing them on a fan site is common, but it isn't licensed. If you'd rather not use them, set `photos: false` under `fans` in `site.config.mjs`, and only your own photos and initials will be shown. Photos from Wikimedia Commons are freely licensed but their licences ask for credit; the fan zone pages carry a general credit line linking to Wikimedia Commons. TheSportsDB is used through its free public key; if it ever stops answering, the other sources carry on.

## Updating the site with a new version of these files

1. On your repository's GitHub page, click **Add file → Upload files**.
2. Drag in the whole `kopon-site` folder from the new download. GitHub replaces the files that changed.
3. Click **Commit changes**. Netlify rebuilds the site in a minute or two.

Your top-stories edits (`content/top-stories.mjs`) are kept, unless the download has its own copy of that file and you drag it in too. In that case, upload everything except `kopon-site/content`.

## YouTube Shorts

Post a Short on the Kop On YouTube channel and it appears on the episode page within about 3 hours. It goes on the newest episode released before the Short, and teasers posted up to 12 hours before an episode count towards that episode. Nothing loads from YouTube until a visitor presses play.

To put a Short on a different episode, or hide one, edit `youtube` in `site.config.mjs`:

```js
extraShorts: { 'Rio the Hero!': ['https://youtube.com/shorts/abcdefghijk'] },
hideShorts: ['https://youtube.com/shorts/zyxwvutsrqp'],
```

## How the Stats page stays up to date

The site rebuilds:

- about **2¼ hours after each kick-off**, so results, tables and the next preview appear soon after the final whistle
- **every 3 hours on the day before and the day of a match**, to pick up team news
- otherwise once a day

Each build only fetches matches it hasn't seen before. Earlier ones are remembered in `stats-cache.json` on the live site, so builds stay quick and API-Football's 100 requests a day go a long way (a normal build uses 0 to 5).

If every data source is down during a build, the page keeps the last good numbers and says so. If there have never been any, it shows a "back soon" note. The rest of the site builds as normal either way.

To check the sources, open the latest deploy log in Netlify (**Deploys** → the top one) and look for lines starting `stats:`.

The xG (expected goals) figures are Kop On's own estimate, worked out from where each shot was taken, using ESPN's match commentary. They're good for comparing teams, but they won't match Opta's numbers exactly.

## Changing things

Almost everything you'd want to change is in **`site.config.mjs`**:

| What | Setting |
| --- | --- |
| The "Welcome to Kop On!" text | `welcome` |
| Podcast app links (Spotify, Apple…) | `listen`; `featured: true` shows it as a button |
| Patreon link | `patreon` |
| Forum rooms | `rooms` |
| YouTube channel, Shorts per episode | `youtube` |
| Fan zone (matches to rate, voting days, photos on or off) | `fans` |
| Your own player photos | `playerPhotos`, or the `photos` folder |
| The site's main address | `siteUrl` |
| News sites | `news.sources` (each can have backup URLs) |
| How often the site refreshes without new episodes | `refreshHours` |
| Clickbait filter, extra words to block | `news.hideClickbait`, `news.extraClickbait` |
| Team, number of fixtures and results on the Stats page | `stats` |

Edit the file on GitHub (click it, then the pencil icon) and commit. Netlify rebuilds automatically.

The logo files are in `src/assets/img/`, colours and fonts are in `src/assets/site.css`, and page layouts are in `src/templates.mjs` (Stats pages: `src/stats-templates.mjs`).

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

- There are no npm packages to install or keep updated. The feed reader, the show-notes cleaner (which strips anything unsafe), the news merger, the top-stories picker and the stats code are all in `lib/`.
- Stats come from ESPN (fixtures, results, match stats, line-ups, injuries), football-data.org (tables, scorers) and API-Football (player stats, injuries). Each one is optional: if one fails, only its section is left out.
- **Team news** (injuries, doubts and suspensions on each match preview, in the line-up picker and in the opposition's predicted XI) comes from the Premier League's official Fantasy Premier League data for every Premier League club, Liverpool included, in every competition. It's free, needs no key, and is kept up to date by the Premier League. It shows each player's news line, his chance of playing (25/50/75%) and the date of the news. A player at 25% or less is left out of the predicted XIs. Premier League bans aren't counted in European or cup matches. For clubs from outside the Premier League (Champions League opponents) the lists come from ESPN and API-Football. While Fantasy Premier League is being updated (it goes offline briefly around each gameweek), the site keeps using the last list it fetched, for up to 3 days.
- Headlines are built into the pages, so they show instantly, and are then refreshed live from `/api/news`.
- If the podcast feed can't be downloaded, the build stops and Netlify keeps the current site online. It never publishes an empty site.

## Working on it locally (optional)

In the local preview, fans' picks are saved in a `.fans-store` folder instead of Netlify Blobs. Netlify installs its storage package (`@netlify/blobs`) by itself when it deploys.

Needs Node.js 18 or newer.

```bash
npm run build      # builds dist/ from the live feed
npm run dev        # preview at http://localhost:8888
npm test           # unit tests
python3 test/browser_test.py   # full browser tests (needs: pip install playwright)
```

To preview offline with the test data: `node test/build-fixture-site.mjs --port 8888 && node scripts/dev-server.mjs --fixtures --port 8888`.

## Search engines (SEO)

The site is set up to be found and understood by Google, Bing (which also powers DuckDuckGo, Yahoo and Ecosia), Brave and others:

- **A sitemap** (`/sitemap.xml`) lists every page, with each episode's artwork for image search, and `robots.txt` points to it. It's already submitted in Google Search Console and Bing Webmaster Tools.
- **IndexNow:** after every new build goes live, the 15-minute check tells Bing, Yandex and others which pages are new or changed, so new episodes appear there within hours instead of days. The key file (`src/static/e0c17130937fbfb6c3e05325380eec19.txt`) proves the site is yours. Turn it off with `indexNow: false` in `site.config.mjs`.
- **Every page** has its own title (ending "| Kop On! LFC podcast"), a description of up to 155 characters, a canonical address, social-sharing cards (episode pages use the episode's artwork) and structured data. That covers the podcast series, each episode (season, number, length, host), Kop On! as an organisation with its other profiles (Spotify, Apple, YouTube, Patreon, Facebook), and breadcrumbs.
- **One address:** visitors to the free Netlify address (koponpodcast-220d25.netlify.app) are sent to koponpodcast.com, so search engines see one site, not two.
- **The home page** has a short "About Kop On!" section describing the show.

To add another profile (Instagram, X, TikTok…), put its address in `sameAs` in `site.config.mjs`. If a search engine ever asks you to verify the site with a code, put the code in `verification` there.

## Episode artwork

Each episode's own artwork (from the podcast feed) appears beside it on the home page, on its episode page, in the episodes list, in the mini player and on phone lock screens. Netlify's free Image CDN serves small, fast copies (`[images]` in `netlify.toml`). If an episode has no artwork of its own, or it can't be loaded, the Kop On! logo is shown instead.
