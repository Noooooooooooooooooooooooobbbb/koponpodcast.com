/* Kop On! audio player
 * - One shared <audio> for the whole page
 * - Big players (.player) on the home hero and episode pages
 * - Play buttons in lists (.play-btn) and a mini player bar at the bottom
 * - Timestamps in show notes (.ts) jump to that moment
 * - Remembers where you stopped (per episode) and your playback speed
 * - Lock-screen / headphone controls via the Media Session API
 */
(function () {
  'use strict';

  var SPEEDS = [1, 1.25, 1.5, 1.75, 2];
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  var posKey = function (guid) { return 'kopon:pos:' + guid; };

  var audio = new Audio();
  audio.preload = 'none';
  var current = null; // { guid, title, src, href, dur }
  var lastSaved = 0;
  var pendingSeek = null;
  var mini = document.getElementById('miniplayer');
  var logo = document.querySelector('meta[name="kopon-art"]');
  var artUrl = logo ? logo.getAttribute('content') : '';

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function parseEp(el) {
    try { return JSON.parse(el.getAttribute('data-play')); } catch (e) { return null; }
  }

  function duration() {
    var d = audio.duration;
    return isFinite(d) && d > 0 ? d : (current && current.dur) || 0;
  }

  function savedPos(guid) {
    var v = parseFloat(store.get(posKey(guid)));
    return isFinite(v) ? v : 0;
  }

  function savePos(force) {
    if (!current) return;
    var now = Date.now();
    if (!force && now - lastSaved < 4000) return;
    lastSaved = now;
    var d = duration(), t = audio.currentTime;
    if (d && t > d - 20) store.del(posKey(current.guid));
    else if (t > 5) store.set(posKey(current.guid), String(Math.floor(t)));
  }

  // ---- loading and controls --------------------------------------------------
  function load(ep, startAt) {
    if (current && current.guid === ep.guid && !audio.error) {
      if (typeof startAt === 'number') seekTo(startAt);
      return;
    }
    savePos(true);
    current = ep;
    audio.src = ep.src;
    audio.playbackRate = parseFloat(store.get('kopon:speed')) || 1;
    var resume = typeof startAt === 'number' ? startAt : savedPos(ep.guid);
    pendingSeek = resume > 0 ? resume : null;
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ep.title, artist: 'Kop On!', album: 'Kop On! A Liverpool FC podcast',
        artwork: ep.art512 ? [{ src: new URL(ep.art512, location.href).href, sizes: '512x512' }] : artUrl ? [{ src: artUrl, sizes: '512x512', type: 'image/png' }] : [],
      });
    }
    render();
  }

  function play(ep, startAt) {
    if (ep) load(ep, startAt);
    if (!current) return;
    if (audio.error) {
      // A previous attempt failed (e.g. a network blip): reload the file and retry
      if (pendingSeek == null && audio.currentTime > 0) pendingSeek = audio.currentTime;
      audio.src = current.src;
      audio.load();
    }
    miniDismissed = false;
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === 'NotAllowedError') return; // autoplay blocked; user can press play
      showError();
    });
    showMini();
    render();
  }

  function toggle(ep) {
    if (ep && (!current || current.guid !== ep.guid)) return play(ep);
    if (audio.paused || audio.error) play(); else audio.pause();
  }

  function seekTo(sec) {
    var d = duration();
    if (d) sec = Math.min(Math.max(0, sec), Math.max(0, d - 1));
    if (audio.readyState >= 1) audio.currentTime = sec;
    else pendingSeek = sec;
    render();
  }

  function skip(delta) {
    if (!current) return;
    seekTo((pendingSeek != null && audio.readyState < 1 ? pendingSeek : audio.currentTime) + delta);
  }

  function cycleSpeed() {
    var i = SPEEDS.indexOf(audio.playbackRate);
    var next = SPEEDS[(i + 1) % SPEEDS.length];
    audio.playbackRate = next;
    store.set('kopon:speed', String(next));
    render();
  }

  function showError() {
    if (!mini) return;
    if (current && !bigVisible()) { miniDismissed = false; showMini(); }
    var t = mini.querySelector('.mini-time');
    if (t) t.textContent = 'Sorry, this episode won’t load right now.';
    mini.classList.add('has-error');
  }

  // ---- mini player visibility --------------------------------------------------
  var visible = {}; // guid -> is its big player on screen?
  var miniDismissed = false;
  function bigVisible() { return !!(current && visible[current.guid]); }
  function showMini() {
    if (!mini || !current) return;
    var shouldShow = !bigVisible() && !miniDismissed;
    mini.hidden = !shouldShow;
    document.body.classList.toggle('has-mini', shouldShow);
  }
  function hideMini() {
    if (!mini) return;
    mini.hidden = true;
    document.body.classList.remove('has-mini');
  }

  // ---- rendering ---------------------------------------------------------------
  function setPlayIcon(btn, playing, label) {
    btn.classList.toggle('is-playing', playing);
    if (label) btn.setAttribute('aria-label', label);
    var text = btn.querySelector('.label');
    if (text) text.textContent = playing ? (btn.getAttribute('data-label-pause') || 'Pause') : (btn.getAttribute('data-label-play') || 'Play');
  }

  function paintWave(root, ratio) {
    var bars = root.querySelectorAll('.bar');
    var on = Math.round(ratio * bars.length);
    for (var i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i < on);
  }

  function render() {
    var playing = !!current && !audio.paused && !audio.ended && !audio.error;
    var t = pendingSeek != null && audio.readyState < 1 ? pendingSeek : audio.currentTime;

    var btns = document.querySelectorAll('.play-btn[data-play]');
    for (var i = 0; i < btns.length; i++) {
      var ep = parseEp(btns[i]);
      var mine = ep && current && ep.guid === current.guid;
      setPlayIcon(btns[i], mine && playing, ep ? (mine && playing ? 'Pause ' : 'Play ') + ep.title : null);
    }

    var players = document.querySelectorAll('.player[data-play]');
    for (var j = 0; j < players.length; j++) {
      var p = players[j], pep = parseEp(p);
      if (!pep) continue;
      var isCur = current && pep.guid === current.guid;
      var d = isCur ? duration() : pep.dur;
      var pos = isCur ? t : savedPos(pep.guid);
      var toggleBtn = p.querySelector('.player-toggle');
      if (toggleBtn) {
        var vis = toggleBtn.getAttribute(isCur && playing ? 'data-label-pause' : 'data-label-play');
        setPlayIcon(toggleBtn, isCur && playing, vis ? vis + ': ' + pep.title : (isCur && playing ? 'Pause ' : 'Play ') + pep.title);
      }
      var cur = p.querySelector('.t-cur');
      if (cur) cur.textContent = fmt(pos);
      var dur = p.querySelector('.t-dur');
      if (dur && d) dur.textContent = fmt(d);
      var seek = p.querySelector('.seek');
      var ratio = d ? Math.min(1, pos / d) : 0;
      if (seek && document.activeElement !== seek) seek.value = String(Math.round(ratio * 1000));
      if (seek) seek.setAttribute('aria-valuetext', fmt(pos) + ' of ' + fmt(d));
      paintWave(p, ratio);
      var resume = p.querySelector('.resume-note');
      if (resume) {
        var sp = savedPos(pep.guid);
        resume.hidden = !(sp > 0 && !isCur);
        resume.textContent = sp > 0 ? 'You stopped at ' + fmt(sp) + ' — press play to carry on.' : '';
      }
      var speeds = p.querySelectorAll('.speed');
      for (var s = 0; s < speeds.length; s++) speeds[s].textContent = (isCur ? audio.playbackRate : parseFloat(store.get('kopon:speed')) || 1) + '×';
    }

    if (mini && current) {
      mini.classList.remove('has-error');
      var mimg = mini.querySelector('.mini-inner > img');
      if (mimg) {
        if (!mimg.getAttribute('data-logo')) mimg.setAttribute('data-logo', mimg.getAttribute('src'));
        var want = current.art || mimg.getAttribute('data-logo');
        if (mimg.getAttribute('data-want') !== want) {
          mimg.setAttribute('data-want', want);
          mimg.onerror = function () { this.onerror = null; this.src = this.getAttribute('data-logo'); };
          mimg.src = want;
        }
      }
      var title = mini.querySelector('.mini-title');
      if (title) { title.textContent = current.title; title.setAttribute('href', current.href); }
      var mt = mini.querySelector('.mini-time');
      if (mt) mt.textContent = fmt(t) + ' / ' + fmt(duration());
      var mtog = mini.querySelector('.mini-toggle');
      if (mtog) setPlayIcon(mtog, playing, playing ? 'Pause' : 'Play');
      var ms = mini.querySelector('.mini-seek');
      var md = duration();
      if (ms && document.activeElement !== ms) ms.value = String(md ? Math.round((t / md) * 1000) : 0);
      if (ms) ms.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(md));
      var msp = mini.querySelector('.speed');
      if (msp) msp.textContent = audio.playbackRate + '×';
    }
  }

  // ---- audio events --------------------------------------------------------------
  audio.addEventListener('loadedmetadata', function () {
    if (pendingSeek != null) {
      try { audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 1)); } catch (e) { /* ignore */ }
      pendingSeek = null;
    }
    render();
  });
  audio.addEventListener('timeupdate', function () { savePos(false); render(); });
  audio.addEventListener('play', render);
  audio.addEventListener('pause', function () { savePos(true); render(); });
  audio.addEventListener('ratechange', render);
  audio.addEventListener('ended', function () { if (current) store.del(posKey(current.guid)); render(); });
  audio.addEventListener('error', function () { if (current) { showError(); render(); } });
  window.addEventListener('pagehide', function () { savePos(true); });

  if ('mediaSession' in navigator) {
    var ms = navigator.mediaSession;
    var set = function (action, fn) { try { ms.setActionHandler(action, fn); } catch (e) { /* unsupported */ } };
    set('play', function () { play(); });
    set('pause', function () { audio.pause(); });
    set('seekbackward', function (d) { skip(-((d && d.seekOffset) || 15)); });
    set('seekforward', function (d) { skip((d && d.seekOffset) || 30); });
    set('seekto', function (d) { if (d && typeof d.seekTime === 'number') seekTo(d.seekTime); });
  }

  // ---- clicks (one delegated listener) --------------------------------------------
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('button') : null;
    if (!el) return;
    var ep;
    if (el.matches('.play-btn[data-play]')) {
      ep = parseEp(el);
      if (ep) { e.preventDefault(); toggle(ep); }
      return;
    }
    var playerEl = el.closest('.player[data-play]');
    if (playerEl) {
      ep = parseEp(playerEl);
      if (!ep) return;
      if (el.matches('.player-toggle')) { toggle(ep); return; }
      if (el.matches('.skip-back')) { load(ep); skip(-15); return; }
      if (el.matches('.skip-fwd')) { load(ep); skip(30); return; }
      if (el.matches('.speed')) { load(ep); cycleSpeed(); return; }
    }
    if (el.matches('.ts[data-t]')) {
      var host = document.querySelector('.player[data-play]');
      ep = host && parseEp(host);
      if (!ep) return;
      play(ep, parseFloat(el.getAttribute('data-t')) || 0);
      if (host.scrollIntoView && !visible[ep.guid]) host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (mini && mini.contains(el)) {
      if (el.matches('.mini-toggle')) toggle();
      else if (el.matches('.skip-back')) skip(-15);
      else if (el.matches('.skip-fwd')) skip(30);
      else if (el.matches('.speed')) cycleSpeed();
      else if (el.matches('.mini-close')) { audio.pause(); miniDismissed = true; hideMini(); }
    }
  });

  // YouTube Shorts: swap the thumbnail for the real player on click
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.short-play[data-yt]') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-yt');
    if (!/^[\w-]{11}$/.test(id)) return;
    if (!audio.paused) audio.pause(); // don't play two things at once
    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
    frame.title = btn.getAttribute('aria-label') || 'YouTube Short';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    btn.replaceWith(frame);
  });

  // A Short whose thumbnail fails to load shows a plain tile instead of a broken image
  document.querySelectorAll('.short-play img').forEach(function (img) {
    var hide = function () { img.style.visibility = 'hidden'; };
    if (img.complete && !img.naturalWidth) hide(); else img.addEventListener('error', hide);
  });

  // Range inputs (waveform and mini player) for seeking
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.matches) return;
    if (el.matches('.player[data-play] .seek')) {
      var ep = parseEp(el.closest('.player'));
      if (!ep) return;
      var switching = !current || current.guid !== ep.guid;
      var wasPlaying = !audio.paused;
      load(ep);
      var d = duration() || ep.dur;
      seekTo((parseFloat(el.value) / 1000) * d);
      // Scrubbing another episode while one is playing: keep the music going
      if (switching && wasPlaying) play();
    } else if (el.matches('.mini-seek') && current) {
      seekTo((parseFloat(el.value) / 1000) * duration());
    }
  });

  // Show the mini player only when the big player for the current episode is off-screen
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var ep = parseEp(en.target);
        if (!ep) return;
        visible[ep.guid] = en.isIntersecting;
        if (current && ep.guid === current.guid && (!audio.paused || audio.currentTime > 0)) {
          if (en.isIntersecting) hideMini(); else showMini();
        }
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('.player[data-play]').forEach(function (p) { io.observe(p); });
  }

  render();
  window.KopOnPlayer = { audio: audio, play: play, seekTo: seekTo, toggle: toggle, current: function () { return current; } };
})();
