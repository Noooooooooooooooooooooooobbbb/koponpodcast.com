// ─────────────────────────────────────────────────────────────────────────────
//  Kop On! website settings — edit this file to change the site.
// ─────────────────────────────────────────────────────────────────────────────
export default {
  siteUrl: 'https://kop-on-podcast.netlify.app', // no trailing slash
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

  // ── Comments / forum ─────────────────────────────────────────────────────
  // provider: 'hyvor' or 'remark42'. Leave the IDs empty to show a
  // "coming soon" panel. You can also set them as Netlify environment
  // variables instead: HYVOR_WEBSITE_ID, REMARK42_HOST, REMARK42_SITE_ID.
  comments: {
    provider: 'hyvor',
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
    sources: [
      { id: 'this-is-anfield', name: 'This Is Anfield', homepage: 'https://www.thisisanfield.com/', urls: ['https://www.thisisanfield.com/feed/'] },
      {
        id: 'liverpool-echo', name: 'Liverpool Echo', homepage: 'https://www.liverpoolecho.co.uk/all-about/liverpool-fc',
        urls: [
          'https://www.liverpoolecho.co.uk/all-about/liverpool-fc?service=rss',
          // Fallback: the general football feed, keeping only LFC headlines
          { url: 'https://www.liverpoolecho.co.uk/sport/football/?service=rss', keywords: ['liverpool', 'lfc', 'anfield', 'reds', 'iraola'] },
        ],
      },
      { id: 'empire-of-the-kop', name: 'Empire of the Kop', homepage: 'https://www.empireofthekop.com/', urls: ['https://www.empireofthekop.com/feed/'] },
      { id: 'the-anfield-wrap', name: 'The Anfield Wrap', homepage: 'https://www.theanfieldwrap.com/', urls: ['https://www.theanfieldwrap.com/feed/'] },
      { id: 'anfield-online', name: 'Anfield Online', homepage: 'https://www.anfield-online.co.uk/', urls: ['https://www.anfield-online.co.uk/feed/'] },
      // The official LFC feed was already failing on the old WordPress page.
      // Uncomment to try it again:
      // { id: 'liverpoolfc', name: 'Liverpool FC', homepage: 'https://www.liverpoolfc.com/news', urls: ['https://www.liverpoolfc.com/news/rss.xml'] },
    ],
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
};
