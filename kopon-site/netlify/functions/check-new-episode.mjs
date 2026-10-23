// Runs every 15 minutes. If the podcast feed has a new (or edited) episode,
// it pokes the Netlify build hook so the site rebuilds itself.
// Needs the BUILD_HOOK_URL environment variable (see README).
import { parsePodcastFeed } from '../../lib/feed.mjs';
import { runScheduledCheck } from '../../lib/rebuild.mjs';
import { shortsFeedUrl, parseShortsFeed } from '../../lib/shorts.mjs';
import siteConfig from '../../site.config.mjs';

const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? process.env[k];

export default async (req, context) => {
  await runScheduledCheck({
    feedUrl: siteConfig.feedUrl,
    siteUrl: context?.site?.url || env('URL') || siteConfig.siteUrl,
    hookUrl: env('BUILD_HOOK_URL'),
    parseFeed: (xml) => parsePodcastFeed(xml),
    shortsUrl: shortsFeedUrl(siteConfig.youtube?.channelId),
    parseShorts: parseShortsFeed,
    maxAgeHours: siteConfig.refreshHours,
  });
};

export const config = { schedule: '*/15 * * * *' };
