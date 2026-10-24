// Pick your XI: choose a formation and eleven players on the pitch, save it,
// then compare with the fans' combined XI. Also opens the opposition's
// predicted line-up from the tab on the side.
import { formationSlots, fansXI, emptyLineupAgg, remapXI, nearestFormation, pitchPos, PITCH_LINES } from './fans-core.js';
import { face, esc, LINE_NAMES, LINE_SHORT } from './fans-ui.js';

const D = JSON.parse(document.getElementById('lineup-data')?.textContent || 'null');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: still works for this visit */ } },
};
function voterId() {
  let v = store.get('kopon:voter');
  if (typeof v !== 'string' || !/^[a-z0-9-]{16,64}$/i.test(v)) {
    v = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
    store.set('kopon:voter', v);
  }
  return v;
}

if (D) {
  const $ = (id) => document.getElementById(id);
  const byId = new Map(D.squad.map((p) => [p.id, p]));
  const KEY_DRAFT = `kopon:xi-draft:${D.matchId}`, KEY_SAVED = `kopon:xi:${D.matchId}`;
  const closed = () => Date.now() >= Date.parse(D.closes);
  const valid = (s) => !!s && typeof s === 'object' && D.formations.includes(s.formation) && Array.isArray(s.xi) && s.xi.length === 11;
  let saved = store.get(KEY_SAVED);
  if (!(saved && valid(saved.vote))) saved = null; // ignore anything odd left in this browser
  const fresh = () => ({ formation: D.lastXI?.formation ? nearestFormation(D.lastXI.formation) : '4-3-3', xi: Array(11).fill(null), captain: null });
  let state = valid(store.get(KEY_DRAFT)) ? store.get(KEY_DRAFT) : valid(saved?.vote) ? { ...saved.vote } : fresh();
  state.xi = state.xi.map((id) => (id && byId.has(id) ? id : null));
  if (state.captain && !state.xi.includes(state.captain)) state.captain = null;
  let current = -1; // slot being chosen for
  let lineFilter = 0;
  let agg = null;

  const slots = () => formationSlots(state.formation);
  const filled = () => state.xi.filter(Boolean).length;
  const persist = () => store.set(KEY_DRAFT, state);
  const status = (msg, kind = '') => { const el = $('xi-status'); el.textContent = msg; el.className = `xi-status${kind ? ` is-${kind}` : ''}`; };

  // ---- the pitch --------------------------------------------------------------------------------
  function renderPitch() {
    const S = slots();
    $('xi-spots').innerHTML = S.map((s, i) => {
      const p = state.xi[i] ? byId.get(state.xi[i]) : null;
      const pos = pitchPos(s);
      if (!p) {
        return `<li class="spot" style="${pos}"><button type="button" class="spot-btn spot-empty" data-slot="${i}" aria-label="${s.role}: empty. Choose a player"${closed() ? ' disabled' : ''}><span class="spot-plus" aria-hidden="true">+</span><span class="spot-role" aria-hidden="true">${s.role}</span></button></li>`;
      }
      const cap = state.captain === p.id;
      const warn = p.out ? ` spot-${p.out.why === 'Doubtful' ? 'doubt' : 'out'}` : '';
      return `<li class="spot" style="${pos}"><button type="button" class="spot-btn${warn}" data-slot="${i}" draggable="${closed() ? 'false' : 'true'}" aria-label="${s.role}: ${esc(p.name)}${p.num ? `, number ${esc(p.num)}` : ''}${cap ? ', captain' : ''}${p.out ? `, ${esc(p.out.why === 'Doubtful' && p.out.chance != null ? `${p.out.chance}% chance of playing` : p.out.why.toLowerCase())}` : ''}. Change"${closed() ? ' disabled' : ''}>${face(p, { size: 'lg' })}${cap ? '<span class="armband" aria-hidden="true">C</span>' : ''}${p.flag ? `<img class="spot-flag" src="${esc(p.flag)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}${p.num ? `<span class="spot-num" aria-hidden="true">${esc(p.num)}</span>` : ''}<span class="spot-name" aria-hidden="true">${esc(p.short)}</span></button></li>`;
    }).join('');
    const n = filled();
    $('xi-count').textContent = closed() ? 'Picks have closed for this match.' : n === 11 ? `All 11 picked${state.captain ? '' : ' (tap a player to make them captain, if you like)'}.` : `${n} of 11 picked.`;
    const save = $('xi-save');
    save.disabled = closed() || n !== 11;
    save.textContent = saved ? 'Update my XI' : 'Save my XI';
    document.querySelectorAll('#xi-formations .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === state.formation ? 'true' : 'false'));
  }

  function renderFormations() {
    $('xi-formations').innerHTML = D.formations.map((f) => `<button type="button" class="chip" data-f="${f}" aria-pressed="false"${closed() ? ' disabled' : ''}>${f}</button>`).join('');
  }

  // Changing formation keeps everyone, moving each player to the same part of the pitch where possible
  function setFormation(f) {
    state.xi = remapXI(state.xi, state.formation, f);
    state.formation = f;
    const xi = state.xi;
    if (state.captain && !xi.includes(state.captain)) state.captain = null;
    persist(); renderPitch();
  }

  function place(slot, id) {
    const at = state.xi.indexOf(id);
    if (at >= 0 && at !== slot) state.xi[at] = state.xi[slot];
    state.xi[slot] = id;
    if (state.captain && !state.xi.includes(state.captain)) state.captain = null;
    persist(); renderPitch();
  }

  // ---- choosing a player -----------------------------------------------------------------------
  const dlg = $('xi-picker');
  function renderList() {
    const q = $('pk-search').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const S = slots();
    const list = D.squad.filter((p) => (q ? p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q) || String(p.num) === q : lineFilter < 0 || p.line === lineFilter));
    $('pk-list').innerHTML = list.length ? list.map((p) => {
      const at = state.xi.indexOf(p.id);
      const tags = [];
      if (at === current) tags.push('<span class="tag tag-on">Picked here</span>');
      else if (at >= 0) tags.push(`<span class="tag">In your XI · ${S[at].role}</span>`);
      if (p.out) tags.push(`<span class="tag tag-${p.out.why === 'Doubtful' ? 'doubt' : 'out'}">${esc(p.out.why === 'Doubtful' && p.out.chance != null ? `${p.out.chance}% chance` : p.out.why)}${p.out.detail ? `: ${esc(p.out.detail)}` : ''}</span>`);
      return `<li><button type="submit" value="pick" class="pk-row" data-id="${esc(p.id)}"${at === current ? ' aria-current="true"' : ''}>${face(p, { size: 'md' })}<span class="pk-num">${esc(p.num || '')}</span><span class="pk-name"><b>${esc(p.name)}</b><small>${LINE_SHORT[p.line]}${p.nation ? ` · ${esc(p.nation)}` : ''}</small>${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</span></button></li>`;
    }).join('') : '<li class="pk-empty">Nobody matches that.</li>';
    $('pk-lines').querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.line === lineFilter && !q ? 'true' : 'false'));
  }
  function openPicker(slot) {
    if (closed()) return;
    current = slot;
    const s = slots()[slot];
    lineFilter = s.line;
    const who = state.xi[slot] ? byId.get(state.xi[slot]) : null;
    $('pk-h').textContent = who ? `${s.role}: change ${who.short}` : `Choose your ${s.role}`;
    $('pk-search').value = '';
    $('pk-lines').innerHTML = [-1, 0, 1, 2, 3].map((l) => `<button type="button" class="chip" data-line="${l}" aria-pressed="false">${l < 0 ? 'Everyone' : LINE_NAMES[l]}</button>`).join('');
    $('pk-foot').innerHTML = who ? `<button type="submit" value="captain" class="btn btn-sm">${state.captain === who.id ? 'Remove captain’s armband' : `Make ${esc(who.short)} captain`}</button><button type="submit" value="remove" class="btn btn-sm">Take ${esc(who.short)} out</button>` : '';
    renderList();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    const mine = dlg.querySelector('.pk-row[aria-current="true"]') || dlg.querySelector('.pk-row');
    if (mine && window.matchMedia('(pointer: fine)').matches) $('pk-search').focus(); else mine?.focus();
  }
  let lastClicked = null;
  dlg.addEventListener('click', (e) => {
    const chipB = e.target.closest('.chip[data-line]');
    if (chipB) { lineFilter = +chipB.dataset.line; $('pk-search').value = ''; renderList(); return; }
    const row = e.target.closest('.pk-row');
    lastClicked = row ? row.dataset.id : null;
  });
  $('pk-search').addEventListener('input', renderList);
  $('pk-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = dlg.querySelector('.pk-row'); if (first) first.click(); } });
  dlg.addEventListener('close', () => {
    const v = dlg.returnValue, slot = current;
    current = -1;
    if (slot < 0) return;
    if (v === 'pick' && lastClicked) place(slot, lastClicked);
    else if (v === 'remove') { state.xi[slot] = null; if (state.captain && !state.xi.includes(state.captain)) state.captain = null; persist(); renderPitch(); }
    else if (v === 'captain') { const id = state.xi[slot]; state.captain = state.captain === id ? null : id; persist(); renderPitch(); }
    lastClicked = null;
    dlg.returnValue = '';
    document.querySelector(`.spot-btn[data-slot="${slot}"]`)?.focus();
  });

  // ---- pitch clicks and drag-to-swap -----------------------------------------------------------
  const pitch = $('xi-spots');
  pitch.addEventListener('click', (e) => { const b = e.target.closest('.spot-btn'); if (b && !b.disabled) openPicker(+b.dataset.slot); });
  let dragFrom = -1;
  pitch.addEventListener('dragstart', (e) => { const b = e.target.closest('.spot-btn'); if (!b) return; dragFrom = +b.dataset.slot; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); });
  pitch.addEventListener('dragover', (e) => { if (dragFrom >= 0 && e.target.closest('.spot-btn')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  pitch.addEventListener('drop', (e) => {
    const b = e.target.closest('.spot-btn'); if (!b || dragFrom < 0) return;
    e.preventDefault();
    const to = +b.dataset.slot;
    if (to !== dragFrom) { [state.xi[to], state.xi[dragFrom]] = [state.xi[dragFrom], state.xi[to]]; persist(); renderPitch(); }
    dragFrom = -1;
  });
  pitch.addEventListener('dragend', () => { dragFrom = -1; });

  $('xi-formations').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b && !closed()) setFormation(b.dataset.f); });
  $('xi-clear').addEventListener('click', () => { if (closed()) return; state.xi = Array(11).fill(null); state.captain = null; persist(); renderPitch(); status(''); });
  $('xi-last')?.addEventListener('click', () => {
    if (closed() || !D.lastXI) return;
    // ESPN's formation might not be one of ours (e.g. 3-4-1-2): use the nearest and move players by position
    const xi = D.lastXI.xi.map((id) => (id && byId.has(id) ? id : null)).slice(0, 11);
    while (xi.length < 11) xi.push(null);
    state.formation = nearestFormation(D.lastXI.formation);
    state.xi = state.formation === D.lastXI.formation ? xi : remapXI(xi, D.lastXI.formation, state.formation);
    state.captain = null;
    persist(); renderPitch();
    const out = state.xi.map((id) => id && byId.get(id)).filter((p) => p?.out && p.out.why !== 'Doubtful');
    status(out.length ? `Loaded. ${out.map((p) => p.short).join(', ')} ${out.length > 1 ? 'are' : 'is'} listed as out, so you might want to change ${out.length > 1 ? 'them' : 'that'}.` : 'Loaded the last starting XI. Make your changes, then save.', out.length ? 'warn' : '');
  });

  // ---- saving and comparing -----------------------------------------------------------------------
  $('xi-save').addEventListener('click', async () => {
    if (closed() || filled() !== 11) return;
    const btn = $('xi-save');
    btn.disabled = true; status('Saving…');
    try {
      const res = await fetch('/api/fans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'lineup', match: D.matchId, voter: voterId(), formation: state.formation, xi: state.xi, captain: state.captain }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Sorry, that didn’t save. Please try again.');
      saved = { vote: j.saved, at: Date.now() };
      store.set(KEY_SAVED, saved);
      status('Saved! Here’s how your XI compares with everyone else’s.', 'ok');
      if (j.agg) { agg = j.agg; renderFans(); $('fans-xi').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } else await loadFans(true);
    } catch (err) {
      status(err.message, 'error');
    } finally { renderPitch(); }
  });

  async function loadFans(scroll = false) {
    try {
      // just saved? skip the shared copy (up to a minute old) so your own pick is in it
      const fresh = saved && Date.now() - saved.at < 120000 ? `&fresh=${Date.now()}` : '';
      const res = await fetch(`/api/fans?kind=lineup&match=${encodeURIComponent(D.matchId)}${fresh}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      agg = (await res.json()).agg;
    } catch { agg = agg || emptyLineupAgg(); }
    renderFans();
    if (scroll) $('fans-xi').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function renderFans() {
    const box = $('fans-xi');
    const A = agg || emptyLineupAgg();
    const X = fansXI(A);
    box.hidden = false;
    if (!X) { box.innerHTML = '<h2 class="h2" id="fx-h">The fans’ XI</h2><p class="fine">No picks yet. Be the first!</p>'; return; }
    const S = formationSlots(X.formation);
    const spots = X.xi.map((id, i) => {
      const p = id && byId.get(id); const s = S[i];
      if (!p) return '';
      return `<li class="spot spot-ro" style="${pitchPos(s)}">${face(p, { size: 'sm' })}${X.captain === id ? '<span class="armband" aria-hidden="true">C</span>' : ''}<span class="spot-name">${esc(p.short)}</span><span class="spot-pct">${X.pct[id]}%</span><span class="visually-hidden">${esc(p.name)}, picked by ${X.pct[id]}% of fans</span></li>`;
    }).join('');
    const mine = saved?.vote;
    const same = mine ? mine.xi.filter((id) => X.xi.includes(id)).length : null;
    const forms = Object.entries(A.formations).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} (${Math.round((100 * n) / A.n)}%)`).join(', ');
    const others = Object.entries(X.pct).filter(([id]) => !X.xi.includes(id) && byId.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 6);
    box.innerHTML = `<h2 class="h2" id="fx-h">The fans’ XI</h2>
<p class="fine">${A.n === 1 ? 'From 1 fan’s pick' : `From ${A.n.toLocaleString('en-GB')} fans’ picks`} · ${esc(X.formation)}${X.captain && byId.get(X.captain) ? ` · captain ${esc(byId.get(X.captain).short)}` : ''}</p>
${same != null ? `<p class="fx-score"><span class="fx-big">${same}<small>/11</small></span> of your players are in the fans’ XI${same === 11 ? '. Great minds!' : '.'}</p>` : ''}
<div class="pitch pitch-mini" aria-label="The fans’ combined XI">${PITCH_LINES}<ol class="spots">${spots}</ol></div>
<p class="fine">Most popular formations: ${esc(forms)}.</p>
${others.length ? `<h3 class="h3">Just missed out</h3><ul class="fx-others">${others.map(([id, pc]) => { const p = byId.get(id); return `<li>${face(p, { size: 'xs' })}<span>${esc(p.name)}</span><span class="rbar" aria-hidden="true"><span style="width:${pc}%"></span></span><b>${pc}%</b></li>`; }).join('')}</ul>` : ''}`;
  }

  // ---- the opposition's predicted XI (flip-out tab) ---------------------------------------------------
  const tab = $('opp-tab'), drawer = $('opp-drawer');
  if (tab && drawer) {
    const setOpen = (open) => {
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('is-open')); $('opp-h').focus(); }
      else { drawer.classList.remove('is-open'); setTimeout(() => { if (tab.getAttribute('aria-expanded') === 'false') drawer.hidden = true; }, 260); }
      document.body.classList.toggle('opp-open', open);
    };
    tab.addEventListener('click', () => setOpen(tab.getAttribute('aria-expanded') !== 'true'));
    // keep the keyboard inside the drawer while it's open
    drawer.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...drawer.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === $('opp-h'))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    drawer.querySelector('.opp-close').addEventListener('click', () => { setOpen(false); tab.focus(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tab.getAttribute('aria-expanded') === 'true' && !dlg.open) { setOpen(false); tab.focus(); } });
  }

  renderFormations();
  renderPitch();
  if (saved || closed()) loadFans();
  if (closed()) status('Picks have closed for this match. Here’s what the fans went for.');
}
