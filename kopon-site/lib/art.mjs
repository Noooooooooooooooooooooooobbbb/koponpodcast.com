// Episode artwork. Each episode in the feed has its own picture, stored by Spotify for Creators
// as a large file (often 3000 × 3000). Netlify's free Image CDN serves a right-sized copy
// (WebP/AVIF where the browser supports it), so pages stay fast. Only addresses from the
// podcast's own image host go through it (netlify.toml lists that host); anything else is
// used as it is.
const CDN_HOST = /^https:\/\/d3t3ozftmdmh3i\.cloudfront\.net\//;

export function artSrc(url, size) {
  if (!url || !CDN_HOST.test(url)) return url || '';
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${size}&h=${size}&fit=cover&q=80`;
}

// src + srcset for a square picture shown at `size` CSS pixels (1× and 2× screens)
export function artAttrs(url, size) {
  if (!url) return null;
  if (!CDN_HOST.test(url)) return { src: url, srcset: '' };
  return { src: artSrc(url, size * 2), srcset: `${artSrc(url, size)} 1x, ${artSrc(url, size * 2)} 2x` };
}

// The episode's own picture, unless it's just the show's logo (the site has a sharper copy of that)
export const episodeArt = (ep, show) => (ep?.image && ep.image !== show?.image ? ep.image : '');
