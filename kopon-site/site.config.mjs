// ─────────────────────────────────────────────────────────────────────────────
//  Kop On! website settings — edit this file to change the site.
// ─────────────────────────────────────────────────────────────────────────────
export default {
  siteUrl: 'https://koponpodcast.com', // the site's main address
  title: 'Kop On! A Liverpool FC (LFC) podcast',
  shortTitle: 'Kop On!',
  welcome: 'Welcome to Kop On!',
  author: 'Owen Thomas',
  description:
    'Kop On! is a Liverpool FC podcast from Owen Thomas: breaking news, tactical insights, player ratings and in-depth analysis for the global LFC family.',
  feedUrl: 'https://anchor.fm/s/56a3330/podcast/rss',

  listen: [
    { name: 'Spotify', url: 'https://open.spotify.com/show/0ZX9kgs5oAKVcI8tUx8XMm', featured: true },
    { name: 'Apple Podcasts', short: 'Apple', url: 'https://podcasts.apple.com/us/podcast/kop-on-a-liverpool-fc-lfc-podcast/id1419639634?uo=4', featured: true },
    { name: 'YouTube', url: 'https://www.youtube.com/c/koponpodcast', featured: true },
    { name: 'Amazon Music', url: 'https://music.amazon.com/podcasts/fdbc5ce4-0029-4dd3-b958-2e3344620463/kop-on-a-liverpool-fc-lfc-podcast' },
    { name: 'Deezer', url: 'https://www.deezer.com/show/1003629092' },
    { name: 'Pocket Casts', url: 'https://pca.st/ZtvV' },
    { name: 'Listen Notes', url: 'https://www.listennotes.com/podcasts/kop-on-a-liverpool-fc-lfc-podcast-owen-thomas-CZLS5cVR2tz/' },
  ],
  patreon: 'https://patreon.com/koponpodcast',

  // Text in show notes after which listing excerpts stop (boilerplate)
  excerptStopMarkers: ['YNWA!! KOP ON YOUTUBE', 'KOP ON YOUTUBE', '“Kop On!” is a podcast'],

  // ── YouTube Shorts on episode pages ─────────────────────────────────────
  // New Shorts on the channel appear automatically on the episode they were
  // posted after (within about 3 hours).
  youtube: {
    channelId: 'UC0dlhg-sM8HAbWvCcOiB0AQ',
    shortsPerEpisode: 6,
    // Put a Short on a specific episode yourself (paste YouTube links):
    //   'Rio the Hero!': ['https://youtube.com/shorts/abcdefghijk'],
    extraShorts: {},
    // Shorts that should never appear on the site (links or IDs):
    hideShorts: [],
  },

  // ── Comments / forum ─────────────────────────────────────────────────────
  // provider: 'disqus' (free), 'cusdis' (free, small), 'hyvor' or 'remark42'.
  // Leave the IDs empty to show a "coming soon" panel. Easiest: set them as
  // Netlify environment variables instead (DISQUS_SHORTNAME, CUSDIS_APP_ID,
  // HYVOR_WEBSITE_ID, REMARK42_HOST + REMARK42_SITE_ID).
  comments: {
    provider: 'disqus',
    disqusShortname: '', // e.g. 'koponpodcast'
    cusdisAppId: '',
    hyvorWebsiteId: '',
    remark42Host: '', // e.g. 'https://comments.example.com'
    remark42SiteId: 'remark',
  },

  // Forum "rooms" on the Community page (each gets its own discussion page).
  // Every episode also gets its own discussion thread automatically.
  rooms: [
    { slug: 'the-terrace', name: 'The Terrace', description: 'General chat about all things Liverpool.' },
    { slug: 'transfer-talk', name: 'Transfer Talk', description: 'Rumours, done deals and wishful thinking.' },
    { slug: 'matchday', name: 'Matchday', description: 'Line-ups, live reactions and post-match verdicts.' },
  ],

  // ── LFC news ─────────────────────────────────────────────────────────────
  // Each source tries its URLs in order until one works. `keywords` keeps
  // only matching headlines (useful for general sports feeds).
  news: {
    // Listed in order of trust: when several sites cover the same story, the
    // headline and summary come from the highest one in this list.
    sources: [
      { id: 'bbc', name: 'BBC Sport', homepage: 'https://www.bbc.co.uk/sport/football/teams/liverpool', urls: ['https://feeds.bbci.co.uk/sport/football/teams/liverpool/rss.xml'] },
      { id: 'guardian', name: 'The Guardian', homepage: 'https://www.theguardian.com/football/liverpool', urls: ['https://www.theguardian.com/football/liverpool/rss'] },
      { id: 'athletic', name: 'The Athletic', homepage: 'https://www.nytimes.com/athletic/football/liverpool/', urls: ['https://www.nytimes.com/athletic/rss/football/liverpool/'] },
      {
        id: 'liverpool-echo', name: 'Liverpool Echo', homepage: 'https://www.liverpoolecho.co.uk/all-about/liverpool-fc',
        urls: [
          'https://www.liverpoolecho.co.uk/all-about/liverpool-fc?service=rss',
          // Fallback: the general football feed, keeping only LFC headlines
          { url: 'https://www.liverpoolecho.co.uk/sport/football/?service=rss', keywords: ['liverpool', 'lfc', 'anfield', 'reds', 'iraola'] },
        ],
      },
      { id: 'this-is-anfield', name: 'This Is Anfield', homepage: 'https://www.thisisanfield.com/', urls: ['https://www.thisisanfield.com/feed/'] },
      { id: 'liverpool-offside', name: 'The Liverpool Offside', homepage: 'https://www.theliverpooloffside.com/', urls: ['https://www.theliverpooloffside.com/rss/index.xml'] },
      { id: 'anfield-online', name: 'Anfield Online', homepage: 'https://www.anfield-online.co.uk/', urls: ['https://www.anfield-online.co.uk/feed/'] },
      { id: 'the-anfield-wrap', name: 'The Anfield Wrap', homepage: 'https://www.theanfieldwrap.com/', urls: ['https://www.theanfieldwrap.com/feed/'] },
      { id: 'football365', name: 'Football365', homepage: 'https://www.football365.com/liverpool', urls: ['https://www.football365.com/liverpool/rss2'] },
      { id: 'anfield-index', name: 'Anfield Index', homepage: 'https://anfieldindex.com/', urls: ['https://anfieldindex.com/feed'] },
      { id: 'sport-witness', name: 'Sport Witness', homepage: 'https://www.sportwitness.co.uk/category/premier-league/liverpool/', urls: ['https://www.sportwitness.co.uk/category/premier-league/liverpool/feed/'] },
      { id: 'liverpool-world', name: 'Liverpool World', homepage: 'https://www.liverpoolworld.uk/sport/football/liverpool', urls: ['https://www.liverpoolworld.uk/sport/football/liverpool/rss'] },
      { id: 'empire-of-the-kop', name: 'Empire of the Kop', homepage: 'https://www.empireofthekop.com/', urls: ['https://www.empireofthekop.com/feed/'] },
      // The official LFC feed was already failing on the old WordPress page.
      // Uncomment to try it again:
      // { id: 'liverpoolfc', name: 'Liverpool FC', homepage: 'https://www.liverpoolfc.com/news', urls: ['https://www.liverpoolfc.com/news/rss.xml'] },
    ],
    topCount: 5, // stories in the "Top stories" box
    hideClickbait: true, // leave obvious clickbait out of the news lists
    // Extra words/phrases that mark a headline as clickbait, e.g. 'transfer gossip'
    extraClickbait: [],
    perSource: 12, // newest headlines kept per site
    max: 60, // headlines on the News page
    maxAgeDays: 30, // ignore anything older than this
  },

  // Episode addresses are made from the title and then never change, even if
  // you retitle an episode later. To force a particular address, add
  // 'Exact episode title': 'wanted-address' here.
  slugOverrides: {},

  // How often the site rebuilds even without a new episode (keeps the
  // built-in headlines fresh for search engines). 0 = never.
  refreshHours: 24,

  // The Stats page. Fixtures, results and team numbers come from ESPN (free,
  // no key). Add these in Netlify's environment variables for more:
  //   FOOTBALL_DATA_KEY – official Premier League & Champions League tables, top scorers
  //   API_FOOTBALL_KEY  – player stats and injury lists (free plan: 100 requests a day)
  // Never put the keys themselves in this file: it's public on GitHub.
  stats: {
    enabled: true,
    teamName: 'Liverpool',
    espnTeamId: '364',     // Liverpool on ESPN
    apiFootballTeamId: 40, // Liverpool on API-Football
    nextCount: 5,          // upcoming matches, each with a preview page
    resultsCount: 8,       // latest results shown
  },

  // ── Fan zone: "Pick your XI" and player ratings (/fans/) ──────────────────
  // Fans' picks are kept in Netlify Blobs (built into Netlify). Your official
  // ratings use the same password as the top-stories editor (EDITOR_PASSWORD).
  fans: {
    enabled: true,
    ratingsMatches: 5,  // how many recent matches can be rated
    ratingsOpenDays: 7, // how long after a match fans can rate it
    photos: true,       // look up player photos automatically (false = initials only)
  },

  // Your own player photos win over the automatic ones. Either put a picture in
  // the kopon-site/photos/ folder named after the player (virgil-van-dijk.jpg),
  // or add a web address here:
  //   'Virgil van Dijk': 'https://example.com/vvd.png',
  playerPhotos: {},
};
