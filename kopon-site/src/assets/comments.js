// Disqus, loaded only after the visitor presses "Show the discussion".
// The choice is remembered, so later pages load it straight away.
(function () {
  'use strict';
  var box = document.querySelector('[data-disqus]');
  if (!box) return;
  var KEY = 'kopon:disqus-ok';
  var loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    var name = box.getAttribute('data-disqus');
    if (!/^[a-z0-9-]+$/.test(name)) return;
    var url = box.getAttribute('data-url'), id = box.getAttribute('data-id'), title = box.getAttribute('data-title');
    window.disqus_config = function () {
      this.page.url = url;
      this.page.identifier = id;
      this.page.title = title;
    };
    var s = document.createElement('script');
    s.src = 'https://' + name + '.disqus.com/embed.js';
    s.setAttribute('data-timestamp', String(Date.now()));
    s.async = true;
    (document.head || document.body).appendChild(s);
    var gate = box.querySelector('.comments-gate');
    if (gate) gate.hidden = true;
  }

  box.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.disqus-load')) {
      try { window.localStorage.setItem(KEY, '1'); } catch (err) { /* private mode */ }
      load();
    }
  });

  var ok = false;
  try { ok = window.localStorage.getItem(KEY) === '1'; } catch (err) { ok = false; }
  if (ok) {
    // Already agreed: load when the discussion scrolls into view
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) { io.disconnect(); load(); }
      }, { rootMargin: '400px' });
      io.observe(box);
    } else {
      load();
    }
  }
})();
