// GET /api/news — fresh LFC headlines as JSON (cached at Netlify's edge).
import { fetchAllNews } from '../../lib/news.mjs';
import siteConfig from '../../site.config.mjs';

export default async () => {
  const n = siteConfig.news;
  const data = await fetchAllNews(n.sources, { perSource: n.perSource, max: n.max, maxAgeDays: n.maxAgeDays });
  const ok = data.items.length > 0;
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers may reuse it for 5 minutes; Netlify's CDN for 15 minutes,
      // then serves the old copy while fetching a new one in the background.
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': ok
        ? 'public, durable, s-maxage=900, stale-while-revalidate=3600'
        : 'public, s-maxage=60',
    },
  });
};

export const config = { path: '/api/news' };
