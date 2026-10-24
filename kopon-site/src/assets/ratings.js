// Player ratings for one match: fans rate everyone out of 10 and pick a player
// of the match; then the results appear in Flappy Jim's style (faces, coloured
// chips and bars, player of the match, team average). The site manager can add
// Kop On's official ratings with the editor password.
import { emptyRatingsAgg, ratingsTable, motmWinner, fansXI, ratingColor } from './fans-core.js';
import { face, chip, bar, esc, matchLine } from './fans-ui.js';

const D = JSON.parse(document.getElementById('ratings-data')?.textContent || 'null');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};
function voterId() {
  let v = store.get('kopon:voter');
  if (typeof v !== 'string' || !/^[a-z0-9-]{16,64}$/i.test(v)) {
    v = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
    store.set('kopon:voter', v);
  }
  return v;
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

if (D) {
  const $ = (id) => document.getElementById(id);
  const app = $('rate-app');
  const byId = new Map(D.players.map((p) => [p.id, p]));
  const KEY = `kopon:rate:${D.matchId}`;
  const isOpen = () => Date.now() < Date.parse(D.closes);
  let saved = store.get(KEY); // { vote, at }
  if (!(saved && saved.vote && typeof saved.vote.r === 'object' && saved.vote.r)) saved = null;
  let data = null; // { agg, official }
  let view = 'fans';
  let editing = !saved && isOpen();
  let draft = { r: { ...(saved?.vote?.r || {}) }, motm: saved?.vote?.motm || null };
  let animate = true;

  // ---- the rating form (used by fans and, below, by the manager) --------------------------
  function formRows(prefix, values) {
    return D.players.map((p) => {
      const v = values.r[p.id];
      const has = v != null;
      return `<li class="rf-row${has ? ' is-rated' : ''}" data-id="${esc(p.id)}">
${face(p, { size: 'md' })}
<span class="rr-num">${esc(p.num || '')}</span>
<span class="rr-name"><b>${esc(p.name)}</b><small>${esc(matchLine(p))}</small></span>
<span class="rf-ctl">
<input type="range" min="1" max="10" step="0.5" value="${has ? v : 6}" id="${prefix}-${esc(p.id)}" aria-label="Rating for ${esc(p.name)}" aria-valuetext="${has ? `${v} out of 10` : 'Not rated'}">
${chip(has ? v : null)}
<button type="button" class="rf-clear" aria-label="Clear ${esc(p.name)}’s rating"${has ? '' : ' hidden'}>×</button>
<button type="button" class="rf-motm" aria-pressed="${values.motm === p.id ? 'true' : 'false'}" aria-label="Player of the match: ${esc(p.name)}" title="Player of the match">★</button>
</span></li>`;
    }).join('');
  }
  function wireForm(root, values, onChange) {
    // a slider starts at 6, so tapping it there (or pressing Enter/Space on it) gives a 6
    const rateNow = (input) => input.dispatchEvent(new Event('input', { bubbles: true }));
    root.addEventListener('pointerup', (e) => { const input = e.target.closest?.('input[type=range]'); if (input && !input.closest('.rf-row').classList.contains('is-rated')) rateNow(input); });
    root.addEventListener('keydown', (e) => { const input = e.target.closest?.('input[type=range]'); if (input && (e.key === 'Enter' || e.key === ' ') && !input.closest('.rf-row').classList.contains('is-rated')) { e.preventDefault(); rateNow(input); } });
    root.addEventListener('input', (e) => {
      const input = e.target.closest('input[type=range]'); if (!input) return;
      const row = input.closest('.rf-row'), id = row.dataset.id, v = +input.value;
      values.r[id] = v;
      row.classList.add('is-rated');
      input.setAttribute('aria-valuetext', `${v} out of 10`);
      row.querySelector('.rchip').outerHTML = chip(v);
      row.querySelector('.rf-clear').hidden = false;
      onChange();
    });
    root.addEventListener('click', (e) => {
      const row = e.target.closest('.rf-row'); if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('.rf-clear')) {
        delete values.r[id];
        row.classList.remove('is-rated');
        const input = row.querySelector('input'); input.value = 6; input.setAttribute('aria-valuetext', 'Not rated');
        row.querySelector('.rchip').outerHTML = chip(null);
        row.querySelector('.rf-clear').hidden = true;
        input.focus();
        onChange();
      } else if (e.target.closest('.rf-motm')) {
        values.motm = values.motm === id ? null : id;
        root.querySelectorAll('.rf-motm').forEach((b) => b.setAttribute('aria-pressed', b.closest('.rf-row').dataset.id === values.motm ? 'true' : 'false'));
        onChange();
      }
    });
  }

  // ---- results in Flappy Jim's style ---------------------------------------------------------------
  function resultsTable(list, { showVotes = false } = {}) {
    if (!list.length) return '<p class="fine">No ratings here yet.</p>';
    return `<ol class="rr-list${animate && !reduced() ? ' is-revealing' : ''}">${list.map((x, i) => {
      const p = byId.get(x.id); if (!p) return '';
      return `<li class="rr" style="--i:${i}">${face(p, { size: 'md' })}<span class="rr-num">${esc(p.num || '')}</span><span class="rr-name"><b>${esc(p.name)}</b><small>${esc(matchLine(p))}${showVotes && x.votes ? ` · ${x.votes} vote${x.votes > 1 ? 's' : ''}` : ''}</small></span>${bar(x.avg)}${chip(x.avg, { label: `${p.name}: ${x.avg} out of 10` })}</li>`;
    }).join('')}</ol>`;
  }
  function motmCard(id, sub) {
    const p = byId.get(id); if (!p) return '';
    return `<div class="motm-card">${face(p, { size: 'xl' })}<span class="motm-label">★ Player of the match</span><span class="motm-name">${esc(p.name)}</span><span class="fine">${esc(sub)}</span></div>`;
  }
  function avgCard(list, sub) {
    if (!list.length) return '';
    const avg = list.reduce((a, x) => a + x.avg, 0) / list.length;
    return `<div class="avg-card"><span class="motm-label">Team average</span><span class="avg-big" style="color:${ratingColor(avg)}">${avg.toFixed(1)}</span><span class="fine">${esc(sub)}</span></div>`;
  }
  const fromVote = (v) => Object.entries(v?.r || {}).map(([id, avg]) => ({ id, avg })).sort((a, b) => b.avg - a.avg);

  const currentAgg = () => data?.agg || emptyRatingsAgg();

  function renderResults() {
    const A = currentAgg();
    const fans = ratingsTable(A), M = motmWinner(A), off = data?.official;
    const stats = D.players.filter((p) => p.stat != null).map((p) => ({ id: p.id, avg: p.stat })).sort((a, b) => b.avg - a.avg);
    const tabs = [['fans', `Fans (${A.n})`], off ? ['kopon', 'Kop On'] : null, saved ? ['mine', 'Yours'] : null, stats.length ? ['stats', 'From the stats'] : null].filter(Boolean);
    if (!tabs.some(([k]) => k === view)) view = 'fans';
    let body = '';
    if (view === 'fans') {
      body = A.n ? `<div class="r-cards">${M ? motmCard(M.id, `${M.pct}% of fans’ votes`) : ''}${avgCard(fans, `${A.n.toLocaleString('en-GB')} fan${A.n > 1 ? 's' : ''} rated this match`)}</div>${resultsTable(fans, { showVotes: true })}` : '<p class="fine">Nobody has rated this match yet. Be the first!</p>';
    } else if (view === 'kopon') {
      const list = fromVote(off);
      body = `<div class="r-cards">${off.motm ? motmCard(off.motm, 'Kop On’s pick') : ''}${avgCard(list, 'Kop On’s ratings')}</div>${off.note ? `<blockquote class="r-note">${esc(off.note)}</blockquote>` : ''}${resultsTable(list)}`;
    } else if (view === 'mine') {
      const list = fromVote(saved.vote);
      body = `<div class="r-cards">${saved.vote.motm ? motmCard(saved.vote.motm, 'Your pick') : ''}${avgCard(list, 'Your ratings')}</div>${resultsTable(list)}`;
    } else {
      body = `<p class="fine">Worked out automatically from each player’s numbers (goals, assists, shots, saves, clean sheet, result and cards), the same way Flappy Jim does.</p>${resultsTable(stats)}`;
    }
    app.innerHTML = `<div class="r-head"><h2 class="h2">Player ratings</h2>${isOpen() ? `<button type="button" class="btn btn-sm" id="r-edit">${saved ? 'Change my ratings' : 'Rate the players'}</button>` : '<span class="fine">Voting has closed.</span>'}</div>
<div class="chips r-tabs" role="tablist" aria-label="Whose ratings">${tabs.map(([k, label]) => `<button type="button" class="chip" role="tab" data-view="${k}" aria-selected="${k === view}" aria-pressed="${k === view}">${esc(label)}</button>`).join('')}</div>
<div class="r-body" role="tabpanel">${body}</div>`;
    animate = false;
  }

  function renderForm() {
    const n = () => Object.keys(draft.r).length;
    app.innerHTML = `<div class="r-head"><h2 class="h2">Your ratings</h2><span class="fine" id="rf-count"></span></div>
<p class="fine">Slide to give each player a mark out of 10 (skip anyone you didn’t see), and tap ★ for your player of the match.</p>
<ol class="rf-list" id="rf-list">${formRows('rf', draft)}</ol>
<div class="xi-actions"><button type="button" class="btn btn-primary" id="rf-save">Save my ratings</button>${saved ? '<button type="button" class="btn" id="rf-cancel">Cancel</button>' : '<button type="button" class="btn" id="rf-peek">Just show me the results</button>'}</div>
<p class="xi-status" id="rf-status" role="status"></p>`;
    const update = () => {
      $('rf-count').textContent = `${n()} of ${D.players.length} rated${draft.motm ? ` · ★ ${byId.get(draft.motm)?.name || ''}` : ''}`;
      $('rf-save').disabled = n() === 0;
    };
    wireForm($('rf-list'), draft, update);
    update();
    $('rf-save').addEventListener('click', save);
    $('rf-cancel')?.addEventListener('click', () => { editing = false; draft = { r: { ...(saved?.vote?.r || {}) }, motm: saved?.vote?.motm || null }; render(); });
    $('rf-peek')?.addEventListener('click', () => { editing = false; render(); load(); });
  }

  async function save() {
    const st = $('rf-status'), btn = $('rf-save');
    btn.disabled = true; st.textContent = 'Saving…'; st.className = 'xi-status';
    try {
      const res = await fetch('/api/fans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'ratings', match: D.matchId, voter: voterId(), r: draft.r, motm: draft.motm }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Sorry, that didn’t save. Please try again.');
      saved = { vote: j.saved, at: Date.now() };
      store.set(KEY, saved);
      editing = false; view = 'fans'; animate = true;
      if (j.agg) { data = { ...(data || {}), agg: j.agg }; renderResults(); } else await load();
      app.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      app.querySelector('.chip[aria-selected="true"]')?.focus();
    } catch (err) {
      st.textContent = err.message; st.className = 'xi-status is-error'; btn.disabled = false;
    }
  }

  function render() { if (editing && isOpen()) renderForm(); else renderResults(); }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('.chip[data-view]');
    if (t) { view = t.dataset.view; animate = true; renderResults(); app.querySelector(`.chip[data-view="${view}"]`)?.focus(); return; }
    if (e.target.closest('#r-edit')) { editing = true; draft = { r: { ...(saved?.vote?.r || {}) }, motm: saved?.vote?.motm || null }; render(); app.querySelector('input[type=range]')?.focus(); }
  });

  async function load() {
    try {
      const fresh = saved && Date.now() - saved.at < 120000 ? `&fresh=${Date.now()}` : '';
      const res = await fetch(`/api/fans?kind=ratings&match=${encodeURIComponent(D.matchId)}${fresh}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      data = await res.json();
    } catch { data = data || { agg: emptyRatingsAgg(), official: null }; }
    if (!(editing && isOpen())) renderResults();
    renderManagerSummary();
  }

  // ---- did the fans' XI match the real one? ----------------------------------------------------------
  async function xiVersus() {
    try {
      const res = await fetch(`/api/fans?kind=lineup&match=${encodeURIComponent(D.matchId)}`);
      if (!res.ok) return;
      const { agg } = await res.json();
      const X = fansXI(agg); if (!X) return;
      const actual = D.players.filter((p) => p.starter).map((p) => p.id);
      const hits = X.xi.filter((id) => actual.includes(id)).length;
      const missed = X.xi.filter((id) => id && !actual.includes(id));
      const box = $('xi-vs');
      box.hidden = false;
      box.innerHTML = `<h2 class="h2">Did the fans call it?</h2><p class="fx-score"><span class="fx-big">${hits}<small>/11</small></span> of the fans’ XI started (from ${agg.n.toLocaleString('en-GB')} pick${agg.n > 1 ? 's' : ''}).</p>${missed.length ? `<p class="fine">The fans also picked ${missed.map((id) => esc(D.names?.[id] || byId.get(id)?.name || id)).join(', ')}, who didn’t start.</p>` : ''}`;
    } catch { /* not important */ }
  }

  // ---- the site manager: Kop On's official ratings -----------------------------------------------------------
  const mgr = $('mgr-body');
  let official = null;
  function renderManagerSummary() {
    official = data?.official || null;
    if (mgr.dataset.mode === 'edit') return;
    const pw = session.get('kopon:mgr');
    mgr.dataset.mode = pw ? 'ready' : 'login';
    mgr.innerHTML = pw
      ? `<p class="fine">${official ? 'Kop On’s ratings are showing on the “Kop On” tab.' : 'No official ratings yet.'}</p><button type="button" class="btn btn-sm" id="mgr-edit">${official ? 'Change Kop On’s ratings' : 'Add Kop On’s ratings'}</button>`
      : `<form id="mgr-login" class="mgr-login"><label for="mgr-pw">Editor password</label><input type="password" id="mgr-pw" autocomplete="current-password" required minlength="8"><button type="submit" class="btn btn-sm">Unlock</button><p class="xi-status" id="mgr-status" role="status"></p></form>`;
  }
  mgr.addEventListener('submit', async (e) => {
    if (e.target.id !== 'mgr-login') return;
    e.preventDefault();
    const pw = $('mgr-pw').value, st = $('mgr-status');
    st.textContent = 'Checking…'; st.className = 'xi-status';
    const res = await fetch('/api/fans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'login', password: pw }) }).catch(() => null);
    const j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { st.textContent = j.error || 'Couldn’t check the password.'; st.className = 'xi-status is-error'; return; }
    session.set('kopon:mgr', j.token || ''); // a 12-hour pass, not the password itself
    renderManagerSummary();
    $('mgr-edit')?.focus();
  });
  mgr.addEventListener('click', async (e) => {
    if (e.target.closest('#mgr-edit')) {
      mgr.dataset.mode = 'edit';
      const vals = { r: { ...(official?.r || {}) }, motm: official?.motm || null };
      mgr.innerHTML = `<p class="fine">These show on the “Kop On” tab for everyone. Fans can still rate as usual.</p><ol class="rf-list" id="mgr-list">${formRows('mg', vals)}</ol>
<label for="mgr-note" class="mgr-note-l">A note to go with them (optional)</label><textarea id="mgr-note" rows="3" maxlength="400">${esc(official?.note || '')}</textarea>
<div class="xi-actions"><button type="button" class="btn btn-primary" id="mgr-save">Publish Kop On’s ratings</button>${official ? '<button type="button" class="btn" id="mgr-delete">Remove them</button>' : ''}<button type="button" class="btn" id="mgr-cancel">Cancel</button></div><p class="xi-status" id="mgr-status" role="status"></p>`;
      wireForm($('mgr-list'), vals, () => {});
      mgr._vals = vals;
      $('mgr-list').querySelector('input')?.focus();
      return;
    }
    if (e.target.closest('#mgr-cancel')) { mgr.dataset.mode = ''; renderManagerSummary(); return; }
    const del = e.target.closest('#mgr-delete');
    if (e.target.closest('#mgr-save') || del) {
      const st = $('mgr-status');
      const vals = del ? { r: {}, motm: null } : mgr._vals;
      st.textContent = 'Saving…'; st.className = 'xi-status';
      const res = await fetch('/api/fans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'official', match: D.matchId, token: session.get('kopon:mgr'), r: vals.r, motm: vals.motm, note: del ? '' : $('mgr-note').value }) }).catch(() => null);
      const j = await res?.json().catch(() => ({})) || {};
      if (!res?.ok) {
        st.textContent = j.error || 'Couldn’t save.'; st.className = 'xi-status is-error';
        if (res?.status === 401) { session.set('kopon:mgr', ''); st.textContent = 'Your manager session has run out. Unlock again with the password.'; mgr.dataset.mode = ''; setTimeout(renderManagerSummary, 2500); }
        return;
      }
      data = { ...(data || {}), official: j.official };
      mgr.dataset.mode = '';
      view = j.official ? 'kopon' : 'fans'; animate = true;
      renderResults(); renderManagerSummary();
      app.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }
  });

  render();
  renderManagerSummary();
  load();
  xiVersus();
}
