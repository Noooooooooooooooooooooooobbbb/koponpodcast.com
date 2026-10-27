// Runs every 15 minutes. If the podcast feed has a new (or edited) episode,
// it pokes the Netlify build hook so the site rebuilds itself.
// Needs the BUILD_HOOK_URL environment variable (see README).
import { parsePodcastFeed } from '../../lib/feed.mjs';
import { runScheduledCheck } from '../../lib/rebuild.mjs';
import { shortsFeedUrl, parseShortsFeed } from '../../lib/shorts.mjs';
import siteConfig from '../../site.config.mjs';
import { indexNowForLiveBuild } from '../../lib/indexnow.mjs';
import { openStore } from '../../lib/fans/store.mjs';

const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? process.env[k];

export default async (req, context) => {
  const siteUrl = context?.site?.url || env('URL') || siteConfig.siteUrl;
  await runScheduledCheck({
    feedUrl: siteConfig.feedUrl,
    siteUrl,
    // after a new build goes live, tell Bing & co. which pages are new (IndexNow)
    afterLive: siteConfig.indexNow === false ? null : async (live) => {
      const store = await openStore('kopon-seo', { KOPON_STORE_DIR: env('KOPON_STORE_DIR') });
      await indexNowForLiveBuild({ live, siteUrl: siteConfig.siteUrl, store });
    },
    hookUrl: env('BUILD_HOOK_URL'),
    parseFeed: (xml) => parsePodcastFeed(xml),
    shortsUrl: shortsFeedUrl(siteConfig.youtube?.channelId),
    parseShorts: parseShortsFeed,
    maxAgeHours: siteConfig.refreshHours,
  });
};

export const config = { schedule: '*/15 * * * *' };
