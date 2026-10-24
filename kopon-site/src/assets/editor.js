// The top-stories editor page. Everything from the news feeds is put on the
// page with textContent/value (never as HTML).
(function () {
  'use strict';
  var root = document.getElementById('editor');
  if (!root) return;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var state = { password: '', edits: null, sha: null, candidates: [] };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'value') n.value = attrs[k];
      else if (k === 'checked') n.checked = !!attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function status(msg, kind) {
    var s = $('#editor-status');
    s.textContent = msg || '';
    s.className = 'editor-status' + (kind ? ' is-' + kind : '');
  }

  function call(action, extra) {
    var body = Object.assign({ action: action, password: state.password }, extra || {});
    return fetch('/api/editor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j; }); });
  }

  // ---- login ------------------------------------------------------------------
  $('#editor-login').addEventListener('submit', function (e) {
    e.preventDefault();
    state.password = $('#editor-password').value;
    load();
  });
  try { var saved = window.sessionStorage.getItem('kopon:editor'); if (saved) { state.password = saved; load(); } } catch (err) { /* ignore */ }

  function load() {
    status('Loading the latest stories…');
    call('load').then(function (j) {
      try { window.sessionStorage.setItem('kopon:editor', state.password); } catch (err) { /* ignore */ }
      state.edits = j.edits; state.sha = j.sha; state.candidates = j.candidates || [];
      $('#editor-login').hidden = true;
      $('#editor-main').hidden = false;
      render();
      status('');
    }).catch(function (err) {
      try { window.sessionStorage.removeItem('kopon:editor'); } catch (e2) { /* ignore */ }
      $('#editor-login').hidden = false;
      $('#editor-main').hidden = true;
      status(err.message, 'error');
    });
  }

  // ---- the stories ----------------------------------------------------------------
  function render() {
    var list = $('#editor-auto');
    list.textContent = '';
    var hidden = state.edits.hidden || [];
    var shown = 0;
    state.candidates.forEach(function (c) {
      var ch = state.edits.changes[c.key] || {};
      var isHidden = hidden.indexOf(c.key) !== -1 || (c.urls || []).some(function (u) { return hidden.indexOf(u) !== -1; });
      if (!isHidden) shown++;
      var inTop = !isHidden && shown + (state.edits.pinned || []).length <= 5;
      var head = el('input', { type: 'text', class: 'ed-input', maxlength: '200', value: ch.headline || c.headline, 'aria-label': 'Headline' });
      var sum = el('textarea', { class: 'ed-input', rows: '3', maxlength: '600', 'aria-label': 'Summary' });
      sum.value = ch.summary || c.summary || '';
      var hide = el('input', { type: 'checkbox', checked: isHidden });
      var card = el('li', { class: 'ed-card' + (isHidden ? ' is-hidden' : '') + (inTop ? ' is-top' : '') }, [
        el('p', { class: 'ed-tag', text: isHidden ? 'Hidden' : inTop ? 'Showing in Top stories' : 'Waiting (not in the top 5)' }),
        el('label', { class: 'ed-label' }, ['Headline', head]),
        el('label', { class: 'ed-label' }, ['Summary', sum]),
        el('p', { class: 'ed-sources', text: (c.count || 1) + ' site' + (c.count === 1 ? '' : 's') + ': ' + (c.sources || []).map(function (s) { return s.name; }).join(', ') }),
        el('div', { class: 'ed-row' }, [
          el('label', { class: 'ed-check' }, [hide, ' Hide this story']),
          el('button', { type: 'button', class: 'btn ed-small', text: 'Undo my changes', onclick: function () { delete state.edits.changes[c.key]; head.value = c.headline; sum.value = c.summary || ''; } }),
        ]),
      ]);
      function sync() {
        var hv = head.value.trim(), sv = sum.value.trim();
        if (hv === c.headline && sv === (c.summary || '')) delete state.edits.changes[c.key];
        else state.edits.changes[c.key] = { headline: hv === c.headline ? '' : hv, summary: sv === (c.summary || '') ? '' : sv };
      }
      head.addEventListener('input', sync);
      sum.addEventListener('input', sync);
      hide.addEventListener('change', function () {
        state.edits.hidden = (state.edits.hidden || []).filter(function (h) { return h !== c.key; });
        if (hide.checked) state.edits.hidden.push(c.key);
        render();
      });
      list.appendChild(card);
    });
    if (!state.candidates.length) list.appendChild(el('li', { class: 'ed-card', text: 'No stories right now. The news sites may be quiet; try again later.' }));

    var pins = $('#editor-pinned');
    pins.textContent = '';
    (state.edits.pinned || []).forEach(function (p, i) {
      pins.appendChild(el('li', { class: 'ed-card is-top' }, [
        el('p', { class: 'ed-tag', text: 'Your story · until ' + new Date(p.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }),
        el('strong', { text: p.headline }),
        p.summary ? el('p', { class: 'ed-sources', text: p.summary }) : null,
        el('button', { type: 'button', class: 'btn ed-small', text: 'Remove', onclick: function () { state.edits.pinned.splice(i, 1); render(); } }),
      ]));
    });
  }

  $('#editor-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var h = f.elements.headline.value.trim();
    if (!h) { status('Give your story a headline.', 'error'); return; }
    state.edits.pinned = state.edits.pinned || [];
    if (state.edits.pinned.length >= 10) { status('That’s the maximum of 10 of your own stories.', 'error'); return; }
    state.edits.pinned.unshift({ headline: h, summary: f.elements.summary.value.trim(), url: f.elements.url.value.trim(), source: f.elements.source.value.trim(), days: f.elements.days.value });
    f.reset();
    render();
    status('Added. Press “Save changes” to put it on the site.', 'ok');
  });

  $('#editor-save').addEventListener('click', function () {
    status('Saving…');
    var btn = $('#editor-save'); btn.disabled = true;
    call('save', { edits: state.edits, sha: state.sha }).then(function (j) {
      state.sha = j.sha; state.edits = j.edits;
      render();
      status('Saved! The site will show your changes in about 2 minutes.', 'ok');
    }).catch(function (err) { status(err.message, 'error'); }).then(function () { btn.disabled = false; });
  });

  $('#editor-logout').addEventListener('click', function () {
    try { window.sessionStorage.removeItem('kopon:editor'); } catch (err) { /* ignore */ }
    window.location.reload();
  });
})();
