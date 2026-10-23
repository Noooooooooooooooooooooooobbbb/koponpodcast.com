// Instant search on the All episodes page
(function () {
  'use strict';
  var input = document.getElementById('episode-search');
  if (!input) return;
  var rows = Array.prototype.slice.call(document.querySelectorAll('.ep-row[data-search]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.ep-group'));
  var count = document.getElementById('episode-count');
  var empty = document.getElementById('episode-empty');
  var total = rows.length;

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’']/g, '');
  }

  function apply() {
    var words = norm(input.value).split(/\s+/).filter(Boolean);
    var shown = 0;
    rows.forEach(function (row) {
      var hay = row.getAttribute('data-search');
      var ok = words.every(function (w) { return hay.indexOf(w) !== -1; });
      row.hidden = !ok;
      if (ok) shown++;
    });
    groups.forEach(function (g) { g.hidden = !g.querySelector('.ep-row:not([hidden])'); });
    if (count) count.textContent = words.length ? shown + ' of ' + total + ' episodes' : total + ' episodes';
    if (empty) empty.hidden = shown !== 0;
  }

  input.addEventListener('input', apply);
  var q = new URLSearchParams(window.location.search).get('q');
  if (q) { input.value = q; }
  apply();
})();
