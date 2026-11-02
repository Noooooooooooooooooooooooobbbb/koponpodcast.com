// The live match centre page (/live/). The page is a frame; src/assets/live.js fills it in
// from /api/live and keeps it up to date. Without JavaScript it still shows the next match.
import { esc } from '../lib/text.mjs';
import { layout } from './templates.mjs';

const ukWhen = (iso, tbc) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(d);
  return tbc ? `${day} (kick-off time to be confirmed)` : `${day} at ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(d)} UK time`;
};

export function livePage(ctx) {
  const { config } = ctx;
  const next = ctx.stats?.next?.[0];
  const nextLine = next ? `<p class="lede">Next: <strong>${esc(next.home.shortName || next.home.name)} v ${esc(next.away.shortName || next.away.name)}</strong>, ${esc(next.comp || '')}, ${esc(ukWhen(next.date, next.tbc))}.</p>` : '';
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / Live</p>
<h1 class="page-title">Live match centre</h1>
<p class="lede">Every Liverpool match as it happens: the score, goals, cards and substitutions, live stats and the line-ups. It updates by itself, so there's no need to refresh.</p>
</div>
<div class="wrap live" id="live-app" data-team="${esc(String(config.stats?.espnTeamId || '364'))}">
<div id="lv-board">${nextLine ? `<div class="lv-board lv-quiet">${nextLine}<noscript><p class="fine">Turn on JavaScript to follow matches live.</p></noscript></div>` : ''}</div>
<p class="lv-note" id="lv-note" role="status" hidden></p>
<p class="visually-hidden" id="lv-live" aria-live="polite"></p>
<div class="lv-grid">
<section class="block lv-action" id="lv-action" aria-labelledby="lv-action-h" hidden>
<h2 class="h2" id="lv-action-h">Latest action</h2>
<div id="lv-feed"></div>
<button type="button" class="btn lv-more" id="lv-more" hidden>Show all</button>
</section>
<section class="block lv-stats-sec" id="lv-stats-sec" aria-labelledby="lv-stats-h" hidden>
<h2 class="h2" id="lv-stats-h">Match stats</h2>
<div id="lv-stats"></div>
</section>
</div>
<section class="block lv-lineups" id="lv-lineups" aria-labelledby="lv-xi-h" hidden>
<h2 class="h2" id="lv-xi-h">Line-ups</h2>
<div class="chips lv-tabs" id="lv-tabs" role="group" aria-label="Choose a team"></div>
<div id="lv-xi"></div>
</section>
<p class="fine lv-foot"><span id="lv-updated"></span> Match data from ESPN; the action is described by Kop On!. <a href="/stats/">Stats and previews →</a></p>
</div>`;
  return layout(ctx, {
    path: '/live/', active: '/live/', title: 'Live: Liverpool match centre',
    description: 'Follow every Liverpool match live: score, goals, cards, substitutions, live stats and line-ups, updated automatically.',
    live: true,
  }, content);
}
