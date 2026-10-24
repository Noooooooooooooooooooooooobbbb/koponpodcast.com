// Stats page: sortable player table, position filter, totals / per 90,
// "compare with" picker for the team rankings, and the full-table toggle.
(function () {
  'use strict';
  var ordinal = function (n) { n = +n; if (!n) return '–'; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  var fmt = function (v, unit) {
    if (v == null || !isFinite(v)) return '–';
    if (unit === 'pct') return v.toFixed(1) + '%';
    if (unit === 'tot') return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
    if (unit === 'num') return v.toFixed(2);
    return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  };

  // ---- full table toggle (Champions League) --------------------------------------
  document.querySelectorAll('.table-toggle').forEach(function (btn) {
    var table = document.getElementById(btn.getAttribute('data-table'));
    if (!table) return;
    var label = btn.textContent;
    table.classList.add('is-collapsed');
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var open = table.classList.toggle('is-collapsed') === false;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Show fewer teams' : label;
    });
  });

  // ---- player table -----------------------------------------------------------------
  var table = document.getElementById('players-table');
  if (table) {
    var tbody = table.tBodies[0];
    var heads = Array.prototype.slice.call(table.tHead.rows[0].cells);
    var mode = 'tot';
    var sortKey = 'mins', sortDir = -1;
    var colIndex = function (key) { for (var i = 0; i < heads.length; i++) { var b = heads[i].querySelector('[data-sort]'); if (b && b.getAttribute('data-sort') === key) return i; } return -1; };
    var value = function (row, i) {
      var c = row.cells[i];
      if (i === 0) return c.getAttribute('data-v') || '';
      var p90 = c.getAttribute('data-p90');
      if (mode === 'p90' && p90 != null) {
        // fewer than 270 minutes: per-90 numbers are too noisy, so they go to the bottom
        return parseFloat(p90) - (+row.getAttribute('data-mins') < 270 ? 1e6 : 0);
      }
      return parseFloat(c.getAttribute('data-v'));
    };
    var sort = function () {
      var i = colIndex(sortKey);
      if (i < 0) return;
      var rows = Array.prototype.slice.call(tbody.rows);
      rows.sort(function (a, b) {
        var x = value(a, i), y = value(b, i);
        if (typeof x === 'string') return sortDir * x.localeCompare(y);
        if (isNaN(x)) x = -Infinity; if (isNaN(y)) y = -Infinity;
        return sortDir * (x - y) || value(a, 0).localeCompare(value(b, 0));
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
      heads.forEach(function (h, k) { if (h.querySelector('[data-sort]')) h.setAttribute('aria-sort', k === i ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'); });
    };
    table.tHead.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sort]');
      if (!b) return;
      var key = b.getAttribute('data-sort');
      if (key === sortKey) sortDir = -sortDir; else { sortKey = key; sortDir = key === 'name' ? 1 : -1; }
      sort();
    });
    var setPressed = function (group, btn) { group.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === btn)); }); };
    document.querySelectorAll('.player-tools [data-pos]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pos = btn.getAttribute('data-pos');
        setPressed(btn.parentNode, btn);
        Array.prototype.forEach.call(tbody.rows, function (r) { r.hidden = !!pos && r.getAttribute('data-pos') !== pos; });
      });
    });
    document.querySelectorAll('.player-tools [data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.getAttribute('data-mode');
        setPressed(btn.parentNode, btn);
        table.classList.toggle('is-p90', mode === 'p90');
        var note = document.querySelector('.p90-note'); if (note) note.hidden = mode !== 'p90';
        tbody.querySelectorAll('[data-p90]').forEach(function (c) { c.textContent = mode === 'p90' ? c.getAttribute('data-p90') : c.getAttribute('data-tot'); });
        sort();
      });
    });
  }

  // ---- compare with another team ---------------------------------------------------------
  var pick = document.getElementById('cmp');
  var dataEl = document.getElementById('ranks-data');
  if (pick && dataEl) {
    var R;
    try { R = JSON.parse(dataEl.textContent); } catch (e) { R = null; }
    if (!R) return;
    var units = {};
    R.metrics.forEach(function (m) { units[m.key] = m.unit; });
    var width = function (k, v) { return v == null || R.hi[k] === R.lo[k] ? 0 : Math.max(2, Math.round(((v - R.lo[k]) / (R.hi[k] - R.lo[k])) * 100)); };
    var tier = function (r) { var n = R.n, f = Math.ceil(n / 5); return !r ? '' : r <= f ? 'r-top' : r > n - f ? 'r-low' : 'r-mid'; };
    pick.addEventListener('change', function () {
      var team = null;
      for (var i = 0; i < R.teams.length; i++) if (R.teams[i].id === pick.value) team = R.teams[i];
      document.querySelectorAll('.rank[data-k]').forEach(function (row) {
        var k = row.getAttribute('data-k');
        var v = team ? team.v[k] : R.avg[k];
        row.querySelector('[data-cmp-name]').textContent = team ? (team.short || '?') : 'Avg';
        row.querySelector('[data-cmp-bar]').style.width = width(k, v) + '%';
        row.querySelector('[data-cmp-v]').textContent = fmt(v, units[k]);
        var r = row.querySelector('[data-cmp-r]');
        r.textContent = team ? ordinal(team.rank[k]) : '';
        r.className = 'bar-r ' + (team ? tier(team.rank[k]) : '');
      });
    });
  }
})();
