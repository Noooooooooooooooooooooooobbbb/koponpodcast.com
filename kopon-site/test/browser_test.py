"""End-to-end browser tests for the Kop On! site.

Needs: Python 3 + Playwright (pip install playwright && playwright install chromium).
Run:   python3 test/browser_test.py        (builds fixture sites and starts its own server)
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, html.parser, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8899
BASE = f'http://127.0.0.1:{PORT}'
SHOTS = Path(os.environ.get('SHOTS', ROOT / 'test' / 'screenshots'))
SHOTS.mkdir(parents=True, exist_ok=True)
EXTERNAL_NOISE = ('fonts.googleapis', 'fonts.gstatic', 'thisisanfield.com', 'liverpoolecho', 'empireofthekop', 'hyvor', 'comments.example.com', 'ERR_', 'net::')

results = []
FAN_NOW = '2026-10-24T12:00:00Z'  # the pretend "now" for the fan zone: picks for Brighton open, Villarreal ratings open
STORE = Path(tempfile.gettempdir()) / 'kopon-fans-test-store'
FACES = sorted((ROOT / 'test/fixtures/faces').glob('*.png'))
def fan_context(browser, w=1280, h=900, ip='10.1.1.1', when=FAN_NOW, broken_face=None, state=None):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, extra_http_headers={'x-forwarded-for': ip}, storage_state=state)
    def face(route):
        u = route.request.url
        if broken_face and broken_face in u: return route.fulfill(status=404, body='')
        n = int(re.sub(r'\D', '', u.split('/')[-1].split('.')[0]) or 0)
        route.fulfill(path=str(FACES[n % len(FACES)]), content_type='image/png')
    ctx.route(re.compile(r'https://(images\.fotmob\.com|upload\.wikimedia\.org)/.*'), face)
    ctx.route(re.compile(r'https://(a\.espncdn\.com|crests\.football-data\.org)/.*'), lambda r: r.fulfill(status=404, body=''))
    ctx.clock.set_fixed_time(when)
    return ctx
def check(cond, name, detail=''):
    results.append((bool(cond), name, detail))
    print(('  PASS ' if cond else '  FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))

def build(*args):
    r = subprocess.run(['node', 'test/build-fixture-site.mjs', '--port', str(PORT), *args], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr); sys.exit('build failed')

def get(path):
    try:
        with urllib.request.urlopen(BASE + path) as r: return r.status, r.read().decode('utf8', 'replace')
    except urllib.error.HTTPError as e: return e.code, e.read().decode('utf8', 'replace')

# ---------------------------------------------------------------- static HTML checks
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr','path','circle','rect','line','polyline','polygon'}
class Lint(html.parser.HTMLParser):
    def __init__(s):
        super().__init__(); s.stack=[]; s.errors=[]; s.ids={}; s.h1=0; s.imgs_no_alt=0; s.jsonld=[]; s._in_ld=False; s.links=set()
    def handle_starttag(s, t, a):
        a = dict(a)
        if 'id' in a:
            if a['id'] in s.ids: s.errors.append(f'duplicate id {a["id"]}')
            s.ids[a['id']] = 1
        if t == 'h1': s.h1 += 1
        if t == 'img' and 'alt' not in a: s.imgs_no_alt += 1
        if t == 'a' and a.get('href'): s.links.add(a['href'])
        if t == 'script' and a.get('type') == 'application/ld+json': s._in_ld = True
        if t not in VOID: s.stack.append(t)
    def handle_endtag(s, t):
        if t in VOID: return
        if not s.stack or s.stack[-1] != t:
            s.errors.append(f'mismatched </{t}> (open: {s.stack[-3:]})')
            if t in s.stack:
                while s.stack and s.stack.pop() != t: pass
        else: s.stack.pop()
        if t == 'script': s._in_ld = False
    def handle_data(s, d):
        if s._in_ld and d.strip(): s.jsonld.append(d)

def lint_page(path, body):
    L = Lint(); L.feed(body); L.close()
    errs = list(L.errors)
    if L.stack: errs.append(f'unclosed {L.stack}')
    if L.h1 != 1: errs.append(f'{L.h1} h1 elements')
    if L.imgs_no_alt: errs.append(f'{L.imgs_no_alt} img without alt')
    for j in L.jsonld:
        try: json.loads(j)
        except Exception as e: errs.append(f'bad JSON-LD: {e}')
    for tag in ('<title>', 'name="description"', 'rel="canonical"', 'og:image', 'lang="en-GB"'):
        if tag not in body: errs.append(f'missing {tag}')
    return errs, L.links

CONTRAST_JS = r"""() => {
 function rgb(s){const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
 function L(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
 function bg(e){let layers=[];while(e){const cs=getComputedStyle(e);if(cs.backgroundImage!=='none'&&!cs.backgroundImage.includes('radial'))return null;const c=rgb(cs.backgroundColor);if(c&&c.a>0){layers.push(c);if(c.a>=1)break;}e=e.parentElement;}
   let base={r:11,g:11,b:15};for(let i=layers.length-1;i>=0;i--){const c=layers[i];base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)}}return base;}
 const out=[];
 for(const e of document.querySelectorAll('body *')){
  if(e.closest('[hidden]'))continue;
  const t=Array.from(e.childNodes).filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
  if(!t)continue;const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
  const cs=getComputedStyle(e);if(cs.visibility==='hidden'||+cs.opacity===0)continue;let c=rgb(cs.color);const b=bg(e);if(!c||!b)continue;
  if(c.a<1)c={r:c.r*c.a+b.r*(1-c.a),g:c.g*c.a+b.g*(1-c.a),b:c.b*c.a+b.b*(1-c.a)};
  const l1=L(c),l2=L(b);const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
  const fs=parseFloat(cs.fontSize);const big=fs>=24||(fs>=18.6&&+cs.fontWeight>=700);
  if(ratio<(big?3:4.5))out.push(t.slice(0,40)+' => '+ratio.toFixed(2));}
 return [...new Set(out)].slice(0,8);}"""

LAYOUT_JS = r"""() => {
 const cw=document.documentElement.clientWidth;
 const wide=[...document.querySelectorAll('body *')].filter(e=>{if(e.closest('[hidden],.mini'))return false;const r=e.getBoundingClientRect();return r.width&&r.right>cw+1&&!e.closest('[data-allow-scroll]')}).slice(0,5).map(e=>e.tagName+'.'+e.className);
 const small=[...document.querySelectorAll('button, input, .btn, .chip, .site-nav a')].filter(e=>{if(e.closest('[hidden]'))return false;const r=e.getBoundingClientRect();if(!r.width)return false;const cs=getComputedStyle(e);if(cs.opacity==='0'&&e.matches('.seek'))return false;const min=e.matches('.ts')?24:40;return r.height<min||r.width<min}).slice(0,5).map(e=>(e.className||e.tagName)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height));
 const unnamed=[...document.querySelectorAll('button, a[href], input')].filter(e=>!e.closest('[hidden]')&&!(e.getAttribute('aria-label')||e.textContent.trim()||e.labels?.length||e.getAttribute('title'))).map(e=>e.outerHTML.slice(0,60)).slice(0,5);
 return {sw:document.documentElement.scrollWidth,cw,wide,small,unnamed};}"""

def main():
    server = None
    try:
        build()
        senv = {**os.environ, 'KOPON_NOW': FAN_NOW, 'KOPON_STORE_DIR': str(STORE)}
        shutil.rmtree(STORE, ignore_errors=True)
        server = subprocess.Popen(['node', 'scripts/dev-server.mjs', '--fixtures', '--port', str(PORT)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=senv)
        for _ in range(50):
            try: urllib.request.urlopen(BASE + '/'); break
            except Exception: time.sleep(0.1)

        print('\n== Static HTML: every page in the sitemap ==')
        st, sm = get('/sitemap.xml')
        paths = [re.sub(r'^https?://[^/]+', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', sm)]
        check(st == 200 and len(paths) == 50 + 8 + 5 + 7, f'sitemap lists {len(paths)} URLs')
        old = (ROOT / 'test/fixtures/old-sitemap.xml').read_text()
        old_paths = [re.sub(r'^https?://[^/]+', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', old)]
        missing = [p for p in old_paths if p not in paths]
        check(not missing, 'every URL from the old site still exists', str(missing[:5]))
        all_links, lint_fail = set(), []
        for p in paths + ['/404.html']:
            st, body = get(p)
            if st != 200: lint_fail.append(f'{p}: HTTP {st}'); continue
            errs, links = lint_page(p, body)
            if errs: lint_fail.append(f'{p}: {errs[:3]}')
            all_links |= {l for l in links if l.startswith('/')}
        check(not lint_fail, f'{len(paths)+1} pages: well-formed, 1 h1, alt text, JSON-LD, meta tags', '; '.join(lint_fail[:4]))
        broken = []
        for l in sorted(all_links):
            st, _ = get(l.split('#')[0])
            if st != 200: broken.append(f'{l} -> {st}')
        check(not broken, f'all {len(all_links)} internal links resolve', str(broken[:5]))
        st, body = get('/this-page-does-not-exist/')
        check(st == 404 and 'Offside!' in body, 'unknown URL returns the 404 page')
        st, body = get('/site-status.json')
        status = json.loads(body)
        check(status['count'] == 50 and status['latestTitle'] == 'Rio the Hero!' and len(status['signature']) == 32, 'site-status.json for the rebuild checker')
        st, robots = get('/robots.txt')
        check('Sitemap: https://koponpodcast.com/sitemap.xml' in robots, 'robots.txt points at sitemap')
        st, key = get('/e0c17130937fbfb6c3e05325380eec19.txt')
        check(st == 200 and key.strip() == 'e0c17130937fbfb6c3e05325380eec19', 'IndexNow key file kept')

        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])

            print('\n== Layout, contrast and errors (desktop + phone) ==')
            sample = ['/', '/episodes/', '/episodes/rio-the-hero/', '/episodes/iraola-s-interview-pt-3-and-darwin-to-return/', '/news/', '/community/', '/community/the-terrace/', '/stats/', '/stats/2026-10-25-brighton/', '/stats/2026-10-28-real-madrid/', '/fans/', '/fans/lineup/', '/fans/ratings/2026-10-21-villarreal/', '/missing/']
            for w in (1280, 390):
                ctx = browser.new_context(viewport={'width': w, 'height': 900})
                page = ctx.new_page()
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not any(n in m.text for n in EXTERNAL_NOISE) and '404' not in m.text else None)
                for p in sample:
                    page.goto(BASE + p, wait_until='networkidle')
                    page.wait_for_timeout(150)
                    lay = page.evaluate(LAYOUT_JS)
                    low = page.evaluate(CONTRAST_JS)
                    check(lay['sw'] <= lay['cw'], f'@{w} {p}: no sideways scrolling', str(lay['wide']))
                    check(not low, f'@{w} {p}: text contrast ≥ WCAG AA', str(low))
                    check(not lay['unnamed'], f'@{w} {p}: every control has a name', str(lay['unnamed']))
                    if w == 390: check(not lay['small'], f'@390 {p}: touch targets ≥ 40px', str(lay['small']))
                    page.screenshot(path=str(SHOTS / f'{(p.strip("/").replace("/", "_") or "home")}_{w}.png'), full_page=True)
                check(not errors, f'@{w}: no JavaScript errors', str(errors[:3]))
                ctx.close()

            print('\n== Home layout and links ==')
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            page.goto(BASE + '/', wait_until='networkidle')
            check(page.inner_text('.hero-label').strip().lower() == 'latest episode' and page.inner_text('#hero-title').strip().lower() == 'rio the hero!', '"Latest episode" label above the episode title')
            check(page.get_attribute('.prev-link a', 'href') == '/episodes/' and page.get_attribute('.prev-link a', 'target') is None, 'small "Previous episodes" link to the episodes page (same tab)')
            check(page.evaluate("document.querySelectorAll('main .ep-row').length") == 0, 'recent-episodes list removed from the home page')
            nw = page.evaluate("(() => { const n = document.querySelector('.home-news').getBoundingClientRect(); const h = document.querySelector('.site-header').getBoundingClientRect(); return [Math.round(n.width), Math.round(h.width)]; })()")
            check(abs(nw[0] - nw[1]) <= 2, f'Latest LFC news spans the full page width {nw}')
            check(page.evaluate("getComputedStyle(document.querySelector('.news-grid')).gridTemplateColumns.split(' ').length") == 3, 'news in 3 columns on desktop')
            ext = page.evaluate("""[...document.querySelectorAll('a[href]')].map(a => [a.getAttribute('href'), a.target, a.rel])""")
            bad = [e for e in ext if (e[0].startswith('http') and not e[0].startswith('https://koponpodcast.com') and (e[1] != '_blank' or 'noopener' not in e[2])) or ((e[0].startswith('/') or e[0].startswith('#')) and e[1] == '_blank')]
            check(not bad, f'all {sum(1 for e in ext if e[0].startswith("http"))} external links open in a new tab, internal ones do not', str(bad[:4]))
            for p in ['/episodes/rio-the-hero/', '/news/', '/community/']:
                body = get(p)[1]
                tags = re.findall(r'<a [^>]*href="https?://[^"]*"[^>]*>', body)
                off = [t for t in tags if 'target="_blank"' not in t and 'koponpodcast.com' not in t]
                check(not off, f'{p}: external links open in a new tab', str(off[:2]))
            page.close()

            print('\n== YouTube Shorts ==')
            page = browser.new_page(viewport={'width': 1280, 'height': 900}); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/episodes/rio-the-hero/', wait_until='domcontentloaded')
            ids = page.eval_on_selector_all('.short-play', 'e => e.map(x => x.dataset.yt)')
            check(ids == ['RioTeaser01', 'RioClip0001'], f'Rio the Hero! shows its 2 Shorts {ids}')
            check(page.evaluate("[...document.querySelectorAll('.short-play img')].every(i => i.src.startsWith('https://i.ytimg.com/vi/'))") and page.evaluate("document.querySelectorAll('iframe').length") == 0, 'only thumbnails until play is pressed (nothing loads from YouTube)')
            page.click('.player-lg .player-toggle')
            page.wait_for_function('() => !KopOnPlayer.audio.paused', timeout=8000)
            page.click('.short-play[data-yt="RioClip0001"]'); page.wait_for_timeout(300)
            src = page.evaluate("document.querySelector('.short iframe') && document.querySelector('.short iframe').src")
            check(src == 'https://www.youtube-nocookie.com/embed/RioClip0001?autoplay=1&playsinline=1&rel=0', 'pressing a clip plays it in place', str(src))
            check(page.evaluate('KopOnPlayer.audio.paused'), 'the podcast pauses while a clip plays')
            check(get('/episodes/feeling-better/')[1].count('class="short-play"') == 1 and 'class="shorts"' not in get('/episodes/kavanagh-ruins-it/')[1], 'Shorts go to the episode they were posted after; none elsewhere')
            check(not errs, 'no errors with Shorts', str(errs[:2]))
            page.close()
            st, ss = get('/site-status.json'); stj = json.loads(ss)
            check(stj['shortsFeedIds'] == ['RioClip0001', 'RioTeaser01', 'LaskClip001'] and len(stj['shorts']) == 3, 'site remembers Shorts for later builds')
            live = ROOT / 'test' / '.live-status.json'
            live.write_text(json.dumps({'shorts': stj['shorts'] + [{'id': 'OldClip0001', 'title': 'Older clip', 'published': '2026-06-02T12:00:00Z'}], 'shortsFeedIds': ['x']}))
            build('--no-shorts', '--live-status', str(live))
            body = get('/episodes/rio-the-hero/')[1]
            check('RioClip0001' in body and 'OldClip0001' in get('/episodes/thank-you-arne/')[1], 'YouTube down at build time: remembered Shorts still shown')
            check(json.loads(get('/site-status.json')[1])['shortsFeedIds'] == ['x'], 'and the checker keeps its previous reference')
            live.unlink()
            build()

            print('\n== Audio player ==')
            ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(BASE + '/', wait_until='networkidle')
            A = lambda js: page.evaluate(js)
            page.click('.hero .player-toggle')
            page.wait_for_function('() => window.KopOnPlayer.audio.currentTime > 0.5', timeout=8000)
            check(not A('KopOnPlayer.audio.paused'), 'hero Play starts the latest episode')
            check(A('KopOnPlayer.current().title') == 'Rio the Hero!', 'it is the latest episode')
            check(page.get_attribute('.hero .player-toggle', 'aria-label') == 'Pause: Rio the Hero!' and page.inner_text('.hero .player-toggle .label') == 'Pause', 'button switches to Pause (label matches visible text)')
            page.wait_for_timeout(1200)
            check(A("document.querySelectorAll('.hero .bar.on').length") >= 0 and A("document.querySelector('.hero .t-cur').textContent") != '0:00', 'time display moves')
            check(A("document.getElementById('miniplayer').hidden"), 'mini player stays hidden while the hero player is on screen')
            page.mouse.wheel(0, 3000); page.wait_for_timeout(500)
            check(not A("document.getElementById('miniplayer').hidden"), 'mini player appears when you scroll away')
            check('Rio the Hero!' in page.inner_text('#miniplayer .mini-title'), 'mini player shows the episode title')
            t0 = A('KopOnPlayer.audio.currentTime')
            page.click('#miniplayer .skip-fwd'); page.wait_for_timeout(300)
            check(A('KopOnPlayer.audio.currentTime') - t0 >= 25, 'skip +30 s works')
            page.click('#miniplayer .speed'); page.wait_for_timeout(100)
            check(A('KopOnPlayer.audio.playbackRate') == 1.25 and A("localStorage.getItem('kopon:speed')") == '1.25', 'speed button cycles and is remembered')
            # Play from the episode list (its own page now)
            page.goto(BASE + '/episodes/', wait_until='networkidle')
            page.click('.ep-row:has-text("Feeling better!") .play-btn'); page.wait_for_timeout(900)
            check(A('KopOnPlayer.current().title') == 'Feeling better!' and not A('KopOnPlayer.audio.paused'), 'list Play on the Episodes page plays that episode')
            check(A("document.querySelectorAll('.ep-row .play-btn.is-playing').length") == 1, 'only the playing episode shows Pause')
            check(not A("document.getElementById('miniplayer').hidden"), 'mini player appears for list playback')
            check(A('KopOnPlayer.audio.playbackRate') == 1.25, 'chosen speed is remembered on other pages')
            check(A("navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title") == 'Feeling better!', 'lock-screen info set (Media Session)')
            page.click('#miniplayer .skip-fwd'); page.wait_for_timeout(400)
            page.click('.ep-row:has-text("Feeling better!") .play-btn'); page.wait_for_timeout(300)
            check(A('KopOnPlayer.audio.paused'), 'pressing it again pauses')
            saved = A("localStorage.getItem('kopon:pos:fixture-guid-049')")
            check(saved is not None and float(saved) > 0, f'position saved on pause ({saved}s)')
            page.goto(BASE + '/', wait_until='networkidle')
            # Seek with the keyboard on the hero waveform
            page.mouse.wheel(0, -5000); page.wait_for_timeout(300)
            page.focus('.hero .seek')
            for _ in range(30): page.keyboard.press('ArrowRight')
            page.wait_for_timeout(300)
            shown = A("document.querySelector('.hero .t-cur').textContent")
            check(A('KopOnPlayer.current().title') == 'Rio the Hero!' and shown != '0:00' and A("document.querySelectorAll('.hero .bar.on').length") > 0, f'keyboard seeking on the waveform moves the start point ({shown})')
            page.click('.hero .player-toggle')
            page.wait_for_function('() => !window.KopOnPlayer.audio.paused && window.KopOnPlayer.audio.currentTime > 5', timeout=8000)
            check(A('KopOnPlayer.audio.currentTime') > 5, 'pressing play starts from the chosen point')
            page.click('.hero .player-toggle'); page.wait_for_timeout(200)
            page.click('#miniplayer .mini-close') if not A("document.getElementById('miniplayer').hidden") else None
            # Resume after reload
            page.goto(BASE + '/episodes/feeling-better/', wait_until='networkidle')
            note = page.inner_text('.resume-note') if page.is_visible('.resume-note') else ''
            check('You stopped at' in note, 'resume note shown after reload', note)
            page.click('.player-lg .player-toggle')
            page.wait_for_function('() => !window.KopOnPlayer.audio.paused && window.KopOnPlayer.audio.currentTime > 0', timeout=8000)
            check(abs(A('KopOnPlayer.audio.currentTime') - float(saved)) < 3, 'playback resumes where you left off')
            # Closing the mini player keeps it closed while scrolling
            page.mouse.wheel(0, 4000); page.wait_for_timeout(500)
            check(not A("document.getElementById('miniplayer').hidden"), 'mini player shows when the big player scrolls away')
            page.click('#miniplayer .mini-close'); page.wait_for_timeout(200)
            page.mouse.wheel(0, -4000); page.wait_for_timeout(400); page.mouse.wheel(0, 4000); page.wait_for_timeout(500)
            check(A("document.getElementById('miniplayer').hidden") and A('KopOnPlayer.audio.paused'), 'a closed mini player stays closed')
            # Timestamps
            page.goto(BASE + '/episodes/rio-the-hero/', wait_until='networkidle')
            check(A("document.querySelectorAll('.notes .ts').length") == 4, '4 clickable timestamps in the show notes')
            page.click('.notes .ts[data-t="252"]')
            page.wait_for_function('() => !window.KopOnPlayer.audio.paused && window.KopOnPlayer.audio.currentTime > 250', timeout=8000)
            check(abs(A('KopOnPlayer.audio.currentTime') - 252) < 3, 'timestamp 04:12 jumps to 252 s')
            page.click('.player-lg .skip-back'); page.wait_for_timeout(300)
            bt = A('KopOnPlayer.audio.currentTime'); check(234 < bt < 245, f'back 15 s works ({bt:.1f}s)')
            page.click('.notes .ts[data-t="1905"]'); page.wait_for_timeout(600)
            check(not errors and A('KopOnPlayer.audio.currentTime') <= 300, 'timestamp past the end of the file is clamped safely')
            st, kav = get('/episodes/kavanagh-ruins-it/')
            check(kav.index('id="comments"') < kav.index('id="notes-h"'), 'Discussion sits above the show notes')
            check('class="ts"' not in kav and '16:30' in kav, 'a lone "16:30" in prose is not turned into a timestamp')
            check(not errors, 'no JavaScript errors in player tests', str(errors[:3]))
            ctx.close()

            print('\n== Retry after a failed audio load ==')
            build('--flaky-audio')
            ctx = browser.new_context(viewport={'width': 1280, 'height': 900}); page = ctx.new_page()
            page.goto(BASE + '/episodes/feeling-better/', wait_until='networkidle')
            page.click('.player-lg .player-toggle'); page.wait_for_timeout(1500)
            first_failed = page.evaluate('!!KopOnPlayer.audio.error')
            page.click('.player-lg .player-toggle')
            ok = True
            try: page.wait_for_function('() => !KopOnPlayer.audio.paused && KopOnPlayer.audio.currentTime > 0.3', timeout=8000)
            except Exception: ok = False
            check(first_failed and ok, 'pressing play again after a network error retries and plays')
            ctx.close()
            build()

            print('\n== Episode search ==')
            page = browser.new_page()
            page.goto(BASE + '/episodes/', wait_until='networkidle')
            vis = lambda: page.evaluate("document.querySelectorAll('.ep-row:not([hidden])').length")
            check(vis() == 50, 'all 50 episodes listed')
            page.fill('#episode-search', 'kavanagh'); check(vis() == 1, 'search "kavanagh" finds 1')
            page.fill('#episode-search', 'jeremy'); check(vis() >= 1, 'search ignores accents ("jeremy" finds Jérémy)')
            page.fill('#episode-search', 'iraolas interview'); check(vis() == 3, 'search ignores apostrophes ("iraolas interview")')
            page.fill('#episode-search', 'zzzzzz')
            check(vis() == 0 and page.is_visible('#episode-empty') and page.inner_text('#episode-count') == '0 of 50 episodes', 'no-results message')
            check(page.evaluate("[...document.querySelectorAll('.ep-group')].every(g => g.hidden)"), 'empty month headings hide')
            page.fill('#episode-search', ''); check(vis() == 50, 'clearing search restores all')
            page.goto(BASE + '/episodes/?q=barcola', wait_until='networkidle'); check(vis() >= 1 and page.input_value('#episode-search') == 'barcola', '?q= in the URL pre-fills search')
            page.close()

            print('\n== News ==')
            page = browser.new_page()
            page.goto(BASE + '/', wait_until='networkidle')
            page.wait_for_selector('[data-news-live="true"]', timeout=5000)
            srcs = page.eval_on_selector_all('.home-news .news-src', 'els => els.map(e => e.textContent)')
            check(len(srcs) == 6 and max(srcs.count(x) for x in srcs) <= 2, f'home shows 6 headline cards, max 2 per site {srcs}')
            check(page.evaluate("[...document.querySelectorAll('.home-news time')].every(t => /ago|Yesterday|Just now/.test(t.textContent))"), 'times shown as "x h ago"')
            check(page.evaluate("[...document.querySelectorAll('.home-news a[href^=\"http\"]')].every(a => a.target === '_blank' && a.rel.includes('noopener'))"), 'headlines open the publisher in a new tab')
            page.goto(BASE + '/news/', wait_until='networkidle')
            page.wait_for_selector('[data-news-live="true"]')
            n_all = page.evaluate("document.querySelectorAll('.news-card, .news-row').length")
            check(n_all == 18, f'news page: 18 headlines (duplicates, old and clickbait removed) after dedupe and age filter ({n_all})')
            titles = page.eval_on_selector_all('.news-card .news-title, .news-row-title', 'e => e.map(x => x.textContent)')
            check(not any('Iraola CONFIRMED' in t for t in titles), 'month-old headline dropped')
            check(sum('Gutter Transfer' in t for t in titles) == 1 and sum('Midweek Extra' in t for t in titles) == 1, 'duplicate headlines removed')
            page.click('.chip[data-source="liverpool-echo"]')
            s2 = page.eval_on_selector_all('.news-src', 'e => [...new Set(e.map(x => x.textContent))]')
            check(s2 == ['Liverpool Echo'] and page.get_attribute('.chip[data-source="liverpool-echo"]', 'aria-pressed') == 'true', 'filter chip shows only that site')
            check(page.evaluate("document.activeElement.matches('.chip[data-source=\"liverpool-echo\"]')"), 'keyboard focus stays on the chip after filtering')
            page.click('.chip[data-source=""]')
            check(page.evaluate("document.querySelectorAll('.news-card, .news-row').length") == n_all, '"All" restores everything')
            page.wait_for_timeout(1500)
            check(page.evaluate("document.querySelectorAll('.news-media.is-broken span').length") >= 1, 'images that fail to load fall back to site initials')
            page.close()

            # Live refresh when the build had no news; and API failure keeps baked news
            build('--no-news')
            page = browser.new_page()
            page.goto(BASE + '/news/', wait_until='domcontentloaded')
            baked_empty = 'No headlines right now' in get('/news/')[1]
            page.wait_for_selector('[data-news-live="true"]', timeout=5000)
            check(baked_empty and page.evaluate("document.querySelectorAll('.news-card, .news-row').length") == 18, 'empty build: live /api/news fills the page')
            page.close()
            build()
            get('/__api-mode?m=fail')
            page = browser.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/news/', wait_until='networkidle'); page.wait_for_timeout(400)
            check(page.evaluate("document.querySelectorAll('.news-card, .news-row').length") == 18 and not errs, 'API down: baked headlines stay, no errors')
            page.close()
            get('/__api-mode?m=ok')
            st, api = get('/api/news')
            data = json.loads(api)
            check(st == 200 and len(data['items']) == 18 and len(data['top']) == 5 and all('errors' in s for s in data['sources']), '/api/news returns JSON with per-site status')

            print('\n== Top stories ==')
            for p in ['/', '/news/']:
                page = browser.new_page(viewport={'width': 1280, 'height': 900})
                page.goto(BASE + p, wait_until='networkidle')
                page.wait_for_selector('[data-news-live="true"]', timeout=5000)
                heads = page.eval_on_selector_all('.top-headline', 'e => e.map(x => x.textContent)')
                check(len(heads) == 5 and heads[0] == "Barcola passed fit for Liverpool's game against Brighton", f'{p}: top 5 stories, most-covered first', str(heads[:2]))
                first = page.inner_text('.top-item')
                check('fit to face Brighton on Saturday' in first and '4 sites' in first and 'BBC Sport' in first, f'{p}: summary, number of sites and sources shown')
                above = page.evaluate("(() => { const t = document.querySelector('.top-stories').getBoundingClientRect().top; const n = document.querySelector('#wire-h, .chips, [data-news-body]').getBoundingClientRect().top; return t < n; })()")
                check(above, f'{p}: top stories sit above the news list')
                titles = page.eval_on_selector_all('.news-title, .news-row-title', 'e => e.map(x => x.textContent)')
                check(not any(re.search(r'imparts 5-word|heartbreaking confession|50% off|quietly amassed', t) for t in titles + heads), f'{p}: no clickbait anywhere')
                page.close()

            print('\n== Top stories editor ==')
            ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/editor/', wait_until='networkidle')
            check('noindex' in get('/editor/')[1] and 'Disallow: /editor/' in get('/robots.txt')[1], 'editor page hidden from search engines')
            page.fill('#editor-password', 'wrong-password'); page.click('#editor-login button')
            page.wait_for_function("document.getElementById('editor-status').textContent.includes('Wrong')", timeout=8000)
            check(page.is_visible('#editor-login') and not page.is_visible('#editor-main'), 'wrong password is refused')
            page.fill('#editor-password', 'kopon-test-password'); page.click('#editor-login button')
            page.wait_for_selector('#editor-main:not([hidden])', timeout=10000)
            cards = page.locator('#editor-auto .ed-card')
            check(cards.count() >= 5 and 'Barcola' in cards.nth(0).locator('input[type=text]').input_value(), f'editor lists the automatic stories ({cards.count()})')
            cards.nth(0).locator('input[type=text]').fill('Barcola fit to face Brighton, says Iraola')
            cards.nth(1).locator('input[type=checkbox]').check(); page.wait_for_timeout(150)
            page.fill('#editor-add [name=headline]', 'Kop On! live show on Sunday at 8pm')
            page.fill('#editor-add [name=summary]', 'Join Owen and Nigel <b>live</b> on YouTube.')
            page.fill('#editor-add [name=url]', 'https://www.youtube.com/c/koponpodcast')
            page.click('#editor-add button[type=submit]')
            check(page.locator('#editor-pinned .ed-card').count() == 1, 'adding your own story')
            page.click('#editor-save')
            page.wait_for_function("document.getElementById('editor-status').textContent.includes('Saved')", timeout=10000)
            saved = get('/__gh-file')[1]
            check('Barcola fit to face Brighton, says Iraola' in saved and 'Kop On! live show' in saved and saved.startswith('// Edits'), 'saving writes the edits file to GitHub')
            page.reload(wait_until='networkidle'); page.wait_for_selector('#editor-main:not([hidden])', timeout=10000)
            check(page.locator('#editor-pinned .ed-card').count() == 1 and page.locator('#editor-auto .ed-card').nth(0).locator('input[type=text]').input_value() == 'Barcola fit to face Brighton, says Iraola', 'reopening the editor shows what was saved')
            check(not errs, 'no errors in the editor', str(errs[:2]))
            ctx.close()
            ef = ROOT / 'test' / '.top-edits.mjs'
            ef.write_text(saved)
            build('--top-edits', str(ef))
            body = get('/')[1]
            top_html = body[body.index('class="top-stories"'):body.index('id="wire-h"')]
            heads = re.findall(r'class="top-headline">(?:<a [^>]*>)?([^<]+)', top_html)
            check(heads[0] == 'Kop On! live show on Sunday at 8pm' and heads[1] == 'Barcola fit to face Brighton, says Iraola' and not any('Elliott' in h for h in heads), f'after the rebuild: own story first, rewrite shown, hidden story gone {heads[:3]}')
            check('&lt;b&gt;live&lt;/b&gt;' in top_html and '<b>live</b>' not in top_html, 'your text is shown safely (no HTML injection)')
            ef.unlink()
            build()

            print('\n== Stable URLs ==')
            live = ROOT / 'test' / '.live-status.json'
            live.write_text(json.dumps({'slugs': {'fixture-guid-049': 'feeling-better'}}))
            build('--retitle', '--live-status', str(live))
            st1, b1 = get('/episodes/feeling-better/')
            st2, _ = get('/episodes/feeling-much-better/')
            check(st1 == 200 and 'Feeling MUCH better!' in b1 and st2 == 404, 'retitled episode keeps its published URL')
            build('--retitle')
            check(get('/episodes/feeling-much-better/')[0] == 200, 'without a live record, new titles get new URLs as normal')
            st, ss = get('/site-status.json')
            check(json.loads(ss)['slugs'].get('fixture-guid-050') == 'rio-the-hero', 'site-status.json records published URLs')
            live.unlink()
            build()

            print('\n== Comments ==')
            st, body = get('/episodes/rio-the-hero/')
            check('The discussion opens soon' in body and 'hyvor' not in body, 'no ID yet: friendly "opens soon" panel')
            build('--comments', 'hyvor')
            st, body = get('/episodes/rio-the-hero/')
            m = re.search(r'<hyvor-talk-comments ([^>]+)>', body)
            check(m and 'website-id="12345"' in m.group(1) and 'page-id="episode-fixture-guid-050"' in m.group(1) and 'colors="dark"' in m.group(1) and 'loading="lazy"' in m.group(1), 'Hyvor Talk embed with stable page-id', m.group(1) if m else 'missing')
            check('src="https://talk.hyvor.com/embed/embed.js" type="module"' in body, 'Hyvor script tag')
            st, room = get('/community/transfer-talk/')
            check('page-id="room-transfer-talk"' in room, 'forum rooms get their own threads')
            build('--comments', 'disqus')
            st, body = get('/episodes/rio-the-hero/')
            check('data-disqus="kopontest"' in body and 'Show the discussion' in body and 'disqus.com/embed.js' not in body, 'Disqus: consent button, nothing loaded up front')
            stub = "window.__dq = {}; var o = {page: {}}; window.disqus_config.call(o); window.__dq = o.page; document.getElementById('disqus_thread').textContent = 'DISQUS LOADED';"
            ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
            dq_requests = []
            ctx.route('https://kopontest.disqus.com/**', lambda r: (dq_requests.append(r.request.url), r.fulfill(body=stub, content_type='text/javascript')))
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/episodes/rio-the-hero/', wait_until='networkidle')
            page.locator('#comments').scroll_into_view_if_needed(); page.wait_for_timeout(400)
            check(not dq_requests, 'Disqus does not load before the visitor agrees')
            page.click('.disqus-load'); page.wait_for_timeout(500)
            dq = page.evaluate('window.__dq')
            check(dq_requests and dq_requests[0].startswith('https://kopontest.disqus.com/embed.js'), 'pressing the button loads Disqus')
            check(dq.get('url') == 'https://koponpodcast.com/episodes/rio-the-hero/' and dq.get('identifier') == 'episode-fixture-guid-050' and dq.get('title') == 'Rio the Hero!', f'each episode gets its own thread {dq}')
            check(not page.is_visible('.comments-gate') and 'DISQUS LOADED' in page.inner_text('#disqus_thread'), 'the consent box makes way for the discussion')
            dq_requests.clear()
            page.goto(BASE + '/episodes/feeling-better/', wait_until='networkidle')
            far = page.evaluate("document.querySelector('.disqus').getBoundingClientRect().top - innerHeight")
            if far > 450: check(not dq_requests, f'after agreeing once: waits until the discussion is near ({int(far)}px away)')
            page.locator('.disqus').scroll_into_view_if_needed(); page.wait_for_timeout(600)
            check(dq_requests and page.evaluate('window.__dq.identifier') == 'episode-fixture-guid-049', 'after agreeing once: loads by itself on other episodes')
            dq_requests.clear()
            page.goto(BASE + '/community/matchday/', wait_until='networkidle')
            page.locator('.disqus').scroll_into_view_if_needed(); page.wait_for_timeout(600)
            check(dq_requests and page.evaluate('window.__dq.identifier') == 'room-matchday', 'after agreeing once: loads by itself on other pages (forum rooms too)')
            check(not errs, 'no errors with Disqus', str(errs[:2]))
            ctx.close()
            build('--comments', 'cusdis')
            st, body = get('/episodes/rio-the-hero/')
            check('id="cusdis_thread"' in body and 'data-app-id="abc-123"' in body and 'data-page-id="episode-fixture-guid-050"' in body and 'src="https://cusdis.com/js/cusdis.es.js"' in body, 'Cusdis embed (alternative free option)')
            build('--comments', 'remark42')
            st, body = get('/episodes/rio-the-hero/')
            cfg = re.search(r'var remark_config = (\{.*?\});', body)
            conf = json.loads(cfg.group(1)) if cfg else {}
            check(conf.get('host') == 'https://comments.example.com' and conf.get('site_id') == 'kopon' and conf.get('url') == 'https://koponpodcast.com/episodes/rio-the-hero/' and conf.get('theme') == 'dark' and '<div id="remark42"></div>' in body, 'Remark42 embed config')
            page = browser.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/episodes/rio-the-hero/', wait_until='domcontentloaded'); page.wait_for_timeout(500)
            check(page.evaluate("[...document.scripts].some(s => s.src === 'https://comments.example.com/web/embed.mjs' && s.type === 'module')") and not errs, 'Remark42 loader injects the right script')
            page.close()

            print('\n== Stats ==')
            page = browser.new_page(viewport={'width': 1280, 'height': 900}); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/stats/', wait_until='networkidle')
            check(page.get_attribute('.site-nav a[href="/stats/"]', 'aria-current') == 'page', 'Stats in the menu, marked as the current page')
            cards = page.locator('.fixture a')
            check(cards.count() == 5 and 'brighton' in cards.nth(0).inner_text().lower() and 'arsenal' in cards.nth(4).inner_text().lower(), f'next five matches, in order ({cards.count()})')
            check(page.locator('.fixture time').nth(0).inner_text().strip() == 'Sun 25 Oct · 14:00', 'kick-off shown in UK time', page.locator('.fixture time').nth(0).inner_text())
            res = page.locator('.result')
            check(res.count() == 8 and re.sub(r'\s+', ' ', res.nth(0).locator('.rs-teams').text_content()).strip() == 'Liverpool4–3Villarreal' and res.nth(0).locator('.res-w').count() == 1, 'latest results, newest first', res.nth(0).text_content()[:60])
            check(page.locator('#pl-table tbody tr').count() == 20 and page.locator('#pl-table tr.us').inner_text().split()[0] == '2', 'Premier League table with Liverpool highlighted')
            vis = lambda sel: page.evaluate(f"[...document.querySelectorAll('{sel}')].filter(r => r.offsetParent).length")
            check(vis('#ucl-table tbody tr') == 8, f'Champions League table starts with the top 8 ({vis("#ucl-table tbody tr")})')
            page.click('.table-toggle')
            check(vis('#ucl-table tbody tr') == 36 and page.get_attribute('.table-toggle', 'aria-expanded') == 'true', 'and "Show all 36 teams" opens the rest')
            page.click('.table-toggle')
            check(vis('#ucl-table tbody tr') == 8, 'and closes again')
            first = lambda: page.locator('#players-table tbody tr').nth(0).locator('th').inner_text()
            check(first() == 'Virgil van Dijk', 'player table sorted by minutes to start')
            page.click('#players-table [data-sort="goals"]')
            check(first() == 'Hugo Ekitike' and page.get_attribute('#players-table th:has([data-sort="goals"])', 'aria-sort') == 'descending', 'click "G" sorts by goals', first())
            page.click('#players-table [data-sort="goals"]')
            check(first() in ('Alisson Becker', 'Virgil van Dijk'), 'click again reverses', first())
            page.click('#players-table [data-sort="shots"]')
            check(first() == 'Mohamed Salah', 'most shots in total: Salah', first())
            page.click('.player-tools [data-mode="p90"]')
            check(first() == 'Hugo Ekitike', 'per 90 minutes: Ekitike (3.10 v 3.08)', first())
            cell = page.locator('#players-table tbody tr').nth(0).locator('td').nth(5).inner_text()
            check(cell == '3.10', f'numbers switch to per 90 ({cell})')
            check(page.is_visible('.p90-note'), 'per-90 note about short cameos shown')
            page.evaluate("""(() => { const r = [...document.querySelectorAll('#players-table tbody tr')].find(r => r.querySelector('th').textContent === 'Rio Ngumoha'); r.setAttribute('data-mins', '20'); r.cells[4].setAttribute('data-p90', '9.00'); })()""")
            page.click('#players-table [data-sort="goals"]')
            check(first() == 'Hugo Ekitike' and page.locator('#players-table tbody tr').last.locator('th').inner_text() == 'Rio Ngumoha', 'per 90: a 20-minute cameo with a goal goes to the bottom, not the top', first())
            page.click('#players-table [data-sort="shots"]')
            page.click('.player-tools [data-mode="tot"]')
            check(page.locator('#players-table tbody tr').nth(0).locator('td').nth(5).inner_text() == '31' and first() == 'Mohamed Salah', 'and back to totals (re-sorted: Salah 31)')
            page.click('.player-tools [data-pos="Goalkeeper"]')
            check(vis('#players-table tbody tr') == 1 and 'Alisson' in page.inner_text('#players-table tbody'), 'position filter: goalkeepers only')
            page.click('.player-tools [data-pos=""]')
            check(vis('#players-table tbody tr') == 7, 'all players again')
            check(page.locator('.leader').count() == 6 and '8' in page.locator('.leader').nth(0).inner_text() and 'Ekitike' in page.locator('.leader').nth(0).inner_text(), 'leader tiles (top scorer etc.)')
            row = page.locator('.rank[data-k="goals"]')
            check(row.locator('.us .bar-r').inner_text() == '1st' and row.locator('[data-cmp-name]').inner_text() == 'Avg', 'team rankings: Liverpool against the league average')
            page.select_option('#cmp', label='Brighton & Hove Albion')
            check(row.locator('[data-cmp-name]').inner_text() == 'BHA' and row.locator('[data-cmp-r]').inner_text() == '3rd', 'compare with another club', row.inner_text())
            page.select_option('#cmp', value='')
            check(row.locator('[data-cmp-name]').inner_text() == 'Avg' and row.locator('[data-cmp-r]').inner_text() == '', 'and back to the league average')
            check('Erling Haaland' in page.inner_text('.scorers'), 'Premier League top scorers')
            page.keyboard.press('Tab')
            page.click('.fixture a >> nth=0')
            page.wait_for_load_state('networkidle')
            check(page.url.endswith('/stats/2026-10-25-brighton/'), 'a fixture opens its preview')
            check(re.sub(r'\s+', ' ', page.inner_text('h1')).strip().lower() == 'liverpool v brighton', 'preview heading', page.inner_text('h1'))
            check(page.locator('.points li').count() >= 6, f'talking points ({page.locator(".points li").count()})')
            news = page.inner_text('#news-h + .two')
            check('Dominik Szoboszlai' in news and 'Giovanni Leoni' in news and 'Solly March' in news, 'team news: injuries for both sides, from FPL (Leoni included)')
            check('50% CHANCE' in news.upper() and 'Knee injury' in news and 'chance of playing' not in news and 'news from 23 Oct' in news, 'doubts show the chance of playing once, with the date of the news')
            check('Danny Welbeck' not in news and 'Federico Chiesa' not in news, 'fit players and loanees are not listed')
            check('official Fantasy Premier League data' in page.inner_text('#news-h ~ .fine'), 'the source is credited')
            check(page.locator('.form-list').nth(0).locator('li').count() == 5, 'last five for each side')
            check(page.locator('table.duel').count() == 2, 'season and league numbers side by side')
            check(page.locator('#h2h-h').count() == 1 and page.locator('#comments').count() == 1, 'recent meetings and a match thread')
            page.goto(BASE + '/stats/2026-11-04-crystal-palace/', wait_until='networkidle')
            check(page.locator('#tbl-h').count() == 0 and page.locator('#nums-h').count() == 0, 'cup tie: no league table or league numbers')
            check(not errs, 'no JavaScript errors on the stats pages', str(errs[:2]))
            page.close()
            # hostile values from an API never run
            for p in ['/stats/', '/stats/2026-10-28-real-madrid/']:
                body = get(p)[1]
                check(body.count('<script') == body.count('</script>'), f'{p}: scripts balanced')

            build('--stats-no-keys')
            page = browser.new_page(viewport={'width': 390, 'height': 900}); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/stats/', wait_until='networkidle')
            check(page.locator('#pl-table tbody tr').count() == 20 and 'ESPN' in page.inner_text('.legend'), 'no API keys: Premier League table from ESPN')
            check(page.locator('#ucl-table').count() == 0 and page.locator('.scorers').count() == 0, 'sections that need a key are left out')
            check(page.locator('#players-table tbody tr').count() == 13 and page.locator('#players-table [data-sort="passPct"]').count() == 0 and 'ESPN line-ups' in page.inner_text('section[aria-labelledby="players-h"]'), 'player stats from ESPN line-ups, without the columns ESPN lacks')
            page.click('#players-table [data-sort="goals"]')
            check(page.locator('#players-table tbody tr').nth(0).locator('th').inner_text() == 'Hugo Ekitike', 'and they sort')
            check(page.locator('.fixture').count() == 5 and page.locator('.rank').count() > 10, 'fixtures, previews and team rankings still there')
            lay = page.evaluate(LAYOUT_JS)
            check(lay['sw'] <= lay['cw'] and not errs, '@390 no sideways scrolling or errors', str(lay['wide']) + str(errs[:2]))
            page.close()
            build('--stats-down')
            body = get('/stats/')[1]
            check('having a breather' in body and get('/stats/2026-10-25-brighton/')[0] == 404, 'all stats sources down: friendly message, no previews')
            check(get('/')[0] == 200 and get('/episodes/rio-the-hero/')[0] == 200, 'and the rest of the site builds as normal')
            build()
            print('\n== Fan zone: pick your XI ==')
            ctx = fan_context(browser); page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/fans/lineup/', wait_until='networkidle')
            A = lambda js: page.evaluate(js)
            check(A("document.querySelectorAll('.spot-btn.spot-empty').length") == 11 and page.is_disabled('#xi-save'), '11 empty positions, Save disabled until all are filled')
            check(A("document.querySelectorAll('#xi-formations .chip').length") == 10 and page.get_attribute('#xi-formations .chip[data-f="4-3-3"]', 'aria-pressed') == 'true', '10 formations, 4-3-3 to start (last match)')
            page.click('.spot-btn[data-slot="1"]')
            check(page.is_visible('#xi-picker') and page.text_content('#pk-h') == 'Choose your RB', 'tapping a position opens the player list for it')
            names = page.eval_on_selector_all('#pk-list .pk-name b', 'e => e.map(x => x.textContent)')
            check(len(names) == 7 and 'Virgil van Dijk' in names and 'Mohamed Salah' not in names, f'defenders shown first ({len(names)})')
            page.click('#pk-lines .chip[data-line="2"]')
            tags = page.inner_text('#pk-list')
            check('Out: Hamstring' in tags, 'injured players are marked (Szoboszlai: Out, hamstring)')
            page.wait_for_timeout(400)
            check(page.evaluate("[...document.querySelectorAll('#pk-list img')].some(i => i.complete && i.naturalWidth > 0)") and page.evaluate("[...document.querySelectorAll('#pk-list img')].every(i => !i.complete || i.naturalWidth > 0)"), 'player faces load')
            check(page.evaluate("[...document.querySelectorAll('#pk-list .face')].some(f => !f.querySelector('img') && f.querySelector('.face-ini').textContent.length === 2)"), 'players without a photo show their initials')
            page.fill('#pk-search', 'salah'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
            check(not page.is_visible('#xi-picker') and 'Mohamed Salah' in page.get_attribute('.spot-btn[data-slot="1"]', 'aria-label'), 'search then Enter picks the player (any position allowed)')
            check(page.evaluate("document.activeElement.dataset.slot") == '1', 'focus goes back to that position')
            page.click('#xi-last'); page.wait_for_timeout(100)
            labels = page.eval_on_selector_all('.spot-btn', 'e => e.map(x => x.getAttribute("aria-label"))')
            check(all('empty' not in l for l in labels) and labels[0].startswith('GK: Alisson Becker') and not page.is_disabled('#xi-save'), 'Start from the last XI fills all 11 and enables Save')
            # the zoomed-in half pitch: back line on the edge of the box, striker by the centre spot,
            # and in every formation no face or name runs into another or off the pitch
            geo = page.evaluate("""() => {
              const mid = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
              const H = document.getElementById('xi-pitch').getBoundingClientRect().height;
              const face = (slot) => mid(document.querySelector(`.spot-btn[data-slot="${slot}"] .face`));
              const box = document.querySelector('.pl-box').getBoundingClientRect().top, spot = mid(document.querySelector('.pl-cspot'));
              return { back: Math.max(...[1,2,3,4].map((i) => Math.abs(face(i) - box))) / H, front: Math.abs(face(10) - spot) / H, gk: face(0) > box };
            }""")
            check(geo['back'] < 0.04 and geo['front'] < 0.04 and geo['gk'], f"half pitch: back four on the edge of the box, striker by the centre spot ({geo})")
            clashes = []
            for f in page.eval_on_selector_all('#xi-formations .chip', 'e => e.map(x => x.dataset.f)'):
                page.click(f'#xi-formations .chip[data-f="{f}"]'); page.wait_for_timeout(120)
                n = page.evaluate("""() => {
                  const P = document.getElementById('xi-pitch').getBoundingClientRect();
                  const parts = [...document.querySelectorAll('#xi-spots .spot')].flatMap((s, i) => [...s.querySelectorAll('.face, .spot-name')].map((e) => ({ i, r: e.getBoundingClientRect() })));
                  let bad = parts.filter((p) => p.r.left < P.left - 1 || p.r.right > P.right + 1 || p.r.top < P.top - 1 || p.r.bottom > P.bottom + 1).length;
                  for (const a of parts) for (const b of parts) if (a.i < b.i && Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1) bad++;
                  return bad; }""")
                if n: clashes.append(f'{f}: {n}')
            check(not clashes, f'all 10 formations: no faces or names overlap or leave the pitch {clashes}')
            page.click('#xi-last'); page.wait_for_timeout(120)  # back to the last XI for the checks below
            page.click('.spot-btn[data-slot="1"]'); page.fill('#pk-search', 'konate'); page.keyboard.press('Enter'); page.wait_for_timeout(100)
            l1, l2 = page.get_attribute('.spot-btn[data-slot="1"]', 'aria-label'), page.get_attribute('.spot-btn[data-slot="2"]', 'aria-label')
            check('Konate' in l1 and 'Frimpong' in l2, 'picking someone already in the team swaps them over')
            page.click('.spot-btn[data-slot="9"]'); page.click('#pk-foot button:has-text("captain")'); page.wait_for_timeout(100)
            check('captain' in page.get_attribute('.spot-btn[data-slot="9"]', 'aria-label') and A("document.querySelectorAll('#xi-spots .armband').length") == 1, 'captain armband')
            page.drag_and_drop('.spot-btn[data-slot="8"]', '.spot-btn[data-slot="10"]'); page.wait_for_timeout(100)
            check('Barcola' in page.get_attribute('.spot-btn[data-slot="8"]', 'aria-label') and 'Salah' in page.get_attribute('.spot-btn[data-slot="10"]', 'aria-label'), 'drag one player onto another to swap them')
            page.click('#xi-formations .chip[data-f="4-2-3-1"]'); page.wait_for_timeout(100)
            labels = page.eval_on_selector_all('.spot-btn', 'e => e.map(x => x.getAttribute("aria-label"))')
            check(len(labels) == 11 and all('empty' not in l for l in labels) and labels[0].startswith('GK: Alisson') and any('captain' in l for l in labels), 'changing formation keeps all 11, the keeper and the captain')
            page.focus('.spot-btn[data-slot="5"]'); page.keyboard.press('Enter'); page.wait_for_timeout(100)
            check(page.is_visible('#xi-picker'), 'keyboard: Enter on a position opens the list')
            page.keyboard.press('Escape'); page.wait_for_timeout(100)
            check(not page.is_visible('#xi-picker') and page.get_attribute('.spot-btn[data-slot="5"]', 'aria-label') == labels[5], 'Escape closes it without changing anything')
            page.reload(wait_until='networkidle')
            check(page.get_attribute('#xi-formations .chip[data-f="4-2-3-1"]', 'aria-pressed') == 'true' and A("document.querySelectorAll('.spot-btn.spot-empty').length") == 0, 'your unsaved team survives a reload')
            mine = page.eval_on_selector_all('.spot-btn', 'e => e.map(x => x.getAttribute("aria-label").split(":")[1].split(",")[0].replace(". Change", "").trim())')
            page.click('#xi-save'); page.wait_for_selector('#fans-xi:not([hidden])')
            check('Saved' in page.inner_text('#xi-status') and page.inner_text('#xi-save') == 'Update my XI', 'Save works')
            check('11/11' in page.inner_text('#fans-xi').replace(' ', '') and 'From 1 fan' in page.inner_text('#fans-xi'), "the fans' XI appears, including your pick straight away")
            me = ctx.storage_state()
            ctx.close()
            # other fans: most pick the last XI in 4-3-3 with Ngumoha instead of Barcola
            for k in range(4):
                c2 = fan_context(browser, ip=f'10.2.0.{k}'); p2 = c2.new_page()
                p2.goto(BASE + '/fans/lineup/', wait_until='networkidle'); p2.click('#xi-last')
                p2.click('.spot-btn[data-slot="10"]'); p2.fill('#pk-search', 'ngumoha'); p2.keyboard.press('Enter')
                p2.click('#xi-save'); p2.wait_for_selector('#fans-xi:not([hidden])'); c2.close()
            ctx = fan_context(browser, state=me); page = ctx.new_page()
            page.goto(BASE + '/fans/lineup/', wait_until='networkidle'); page.wait_for_selector('#fans-xi:not([hidden]) .spot')
            fx = page.inner_text('#fans-xi')
            check('From 5 fans' in fx and '4-3-3' in fx and 'NGUMOHA' in fx.upper(), "the fans' XI follows the majority (5 picks, 4-3-3, Ngumoha in)")
            m = re.search(r'(\d+)\s*/11', fx)
            check(m and m.group(1) == '10', f'your score against the fans’ XI ({m.group(1) if m else None}/11)')
            check('just missed out' in fx.lower() and 'Bradley Barcola' in fx, "players who just missed out are listed (Barcola, 20%)")
            # the opposition's predicted XI
            page.click('#opp-tab'); page.wait_for_timeout(350)
            check(page.is_visible('#opp-drawer') and page.get_attribute('#opp-tab', 'aria-expanded') == 'true' and page.evaluate("document.activeElement.id") == 'opp-h', 'the side tab flips out Brighton’s predicted XI')
            dr = page.inner_text('#opp-drawer')
            check(page.evaluate("document.querySelectorAll('#opp-drawer .spot').length") == 11 and 'MINTEH' in dr.upper() and 'Solly March' in dr and '4-2-3-1' in dr, 'predicted XI: 11 players, Minteh in for the injured March')
            check('HINSHELWOOD' in dr.upper() and '25% chance' in dr and 'Jason Steele' in dr, 'Mitoma (25%) swapped out too; doubts listed with their chance')
            for _ in range(6): page.keyboard.press('Tab')
            check(page.evaluate("document.getElementById('opp-drawer').contains(document.activeElement)"), 'Tab keeps the keyboard inside the open drawer')
            page.keyboard.press('Escape'); page.wait_for_timeout(350)
            check(not page.is_visible('#opp-drawer') and page.evaluate("document.activeElement.id") == 'opp-tab', 'Escape closes it, focus back on the tab')
            check(not errs, 'no JavaScript errors on the line-up page', str(errs[:3]))
            ctx.close()
            # a missing photo falls back to initials
            ctx = fan_context(browser, broken_face='33004'); page = ctx.new_page()
            page.goto(BASE + '/fans/lineup/', wait_until='networkidle'); page.click('#xi-last'); page.wait_for_timeout(400)
            vvd = page.locator('.spot-btn', has_text='VAN DIJK').first
            check(vvd.locator('img').count() == 0 and vvd.locator('.face-ini').inner_text() == 'VD', 'a photo that fails to load shows initials instead')
            ctx.close()
            # phone
            ctx = fan_context(browser, 390, 844); page = ctx.new_page()
            page.goto(BASE + '/fans/lineup/', wait_until='networkidle'); page.click('#xi-last'); page.click('.spot-btn[data-slot="3"]'); page.wait_for_timeout(200)
            box = page.evaluate("(() => { const r = document.getElementById('xi-picker').getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth, innerHeight]; })()")
            check(box[0] >= 0 and box[1] <= box[3] and box[2] <= box[4], f'@390: the player list fits the screen {box}')
            page.keyboard.press('Escape')
            sizes = page.evaluate("[...document.querySelectorAll('.spot-btn')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })")
            check(min(sizes) >= 44 and page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f'@390: positions are big enough to tap ({int(min(sizes))}px), no sideways scrolling')
            page.click('#opp-tab'); page.wait_for_timeout(350)
            r = page.evaluate("(() => { const r = document.getElementById('opp-drawer').getBoundingClientRect(); return [r.left, r.width, innerWidth]; })()")
            check(r[0] >= -1 and r[1] <= r[2] + 1, '@390: the predicted XI drawer fills the screen')
            ctx.close()
            # after kick-off
            get('/__now?t=2026-10-25T14:05:00Z')
            ctx = fan_context(browser, when='2026-10-25T14:05:00Z'); page = ctx.new_page()
            page.goto(BASE + '/fans/lineup/', wait_until='networkidle'); page.wait_for_selector('#fans-xi:not([hidden])')
            check(page.is_disabled('#xi-save') and page.is_disabled('.spot-btn[data-slot="0"]') and 'closed' in page.inner_text('#xi-count'), 'after kick-off: picks closed, the fans’ XI is shown to everyone')
            res = page.evaluate("""fetch('/api/fans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'lineup', match: '700090', voter: 'late-voter-0000000001', formation: '4-3-3', xi: [] }) }).then(r => r.status)""")
            check(res == 409, 'and the server refuses late picks')
            res = page.evaluate("""fetch('/api/fans', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }).then(r => r.status)""")
            check(res == 415, 'votes must be sent as the site sends them (blocks other websites)')
            ctx.close()
            get(f'/__now?t={FAN_NOW}')

            print('\n== Fan zone: player ratings ==')
            ctx = fan_context(browser); page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/fans/ratings/2026-10-21-villarreal/', wait_until='networkidle')
            A = lambda js: page.evaluate(js)
            check(A("document.querySelectorAll('.rf-row').length") == 13 and page.is_disabled('#rf-save'), '13 players who played (11 starters + 2 subs), Save disabled until a rating')
            row = '.rf-row[data-id="virgil-van-dijk"]'
            page.focus(f'{row} input'); [page.keyboard.press('ArrowRight') for _ in range(4)]
            check(page.inner_text(f'{row} .rchip') == '8.0' and page.get_attribute(f'{row} input', 'aria-valuetext') == '8 out of 10' and not page.is_disabled('#rf-save'), 'keyboard: arrows set a rating in halves (6 → 8.0)')
            check(page.evaluate(f"getComputedStyle(document.querySelector('{row} .rchip')).backgroundColor") == 'rgb(22, 163, 74)', "Flappy Jim's green for 8+")
            page.click(f'{row} .rf-clear')
            check(page.inner_text(f'{row} .rchip') == '–' and page.is_disabled('#rf-save'), 'a rating can be cleared again')
            bb = page.locator(f'{row} input').bounding_box()
            page.mouse.click(bb['x'] + 8 + (bb['width'] - 16) * 5 / 9, bb['y'] + bb['height'] / 2)
            got = page.inner_text(f'{row} .rchip')
            check(got == '6.0', f'tapping a slider where it rests gives a 6 (got {got})')
            page.click(f'{row} .rf-clear')
            page.focus(f'{row} input'); page.keyboard.press('Enter')
            check(page.inner_text(f'{row} .rchip') == '6.0', 'so does Enter on it')
            page.click(f'{row} .rf-clear')
            vals = {'virgil-van-dijk': 4, 'hugo-ekitike': 6, 'rio-ngumoha': 7, 'alisson-becker': 1, 'jeremie-frimpong': -2}
            for pid, n in vals.items():
                page.focus(f'.rf-row[data-id="{pid}"] input')
                for _ in range(abs(n)): page.keyboard.press('ArrowRight' if n > 0 else 'ArrowLeft')
            page.click('.rf-row[data-id="hugo-ekitike"] .rf-motm'); page.click('.rf-row[data-id="rio-ngumoha"] .rf-motm')
            check(A("document.querySelectorAll('.rf-motm[aria-pressed=true]').length") == 1 and page.get_attribute('.rf-row[data-id="rio-ngumoha"] .rf-motm', 'aria-pressed') == 'true', 'only one player of the match')
            check('5 of 13 rated' in page.inner_text('#rf-count'), 'counter')
            page.click('#rf-save'); page.wait_for_selector('.r-tabs')
            body = page.inner_text('#rate-app')
            check('Fans (1)' in body and 'RIO NGUMOHA' in body.upper() and '100% of fans' in body, 'saved: fans’ results with you counted, player of the match card')
            check(A("document.querySelectorAll('.rr-list .rr').length") == 5 and page.inner_text('.rr-list .rr:first-child .rchip') == '9.5', 'results sorted best first (Ngumoha 9.5)')
            page.click('.chip[data-view="stats"]')
            check(A("document.querySelectorAll('.rr-list .rr').length") == 13, '“From the stats” tab shows the automatic ratings')
            me = ctx.storage_state()
            ctx.close()
            for k in range(3):
                c2 = fan_context(browser, ip=f'10.3.0.{k}'); p2 = c2.new_page()
                p2.goto(BASE + '/fans/ratings/2026-10-21-villarreal/', wait_until='networkidle')
                p2.focus('.rf-row[data-id="virgil-van-dijk"] input'); [p2.keyboard.press('ArrowRight') for _ in range(2 + k)]
                p2.click('.rf-row[data-id="virgil-van-dijk"] .rf-motm'); p2.click('#rf-save'); p2.wait_for_selector('.r-tabs'); c2.close()
            ctx = fan_context(browser, state=me); page = ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/fans/ratings/2026-10-21-villarreal/', wait_until='networkidle'); page.wait_for_selector('.r-tabs')
            body = page.inner_text('#rate-app')
            vvd = page.locator('.rr', has_text='Virgil van Dijk')
            check('Fans (4)' in body and 'VIRGIL VAN DIJK' in body.upper() and '75% of fans' in body and vvd.locator('.rchip').inner_text() == '7.6', f"returning: fans' averages from everyone (van Dijk (8+7+7.5+8)/4 = 7.6)")
            check('Yours' in body, 'your own ratings have their own tab')
            page.click('#r-edit'); page.wait_for_selector('#rf-list')
            check(page.inner_text('.rf-row[data-id="rio-ngumoha"] .rchip') == '9.5' and page.get_attribute('.rf-row[data-id="rio-ngumoha"] .rf-motm', 'aria-pressed') == 'true', 'Change my ratings: your previous ratings are filled in')
            page.click('#rf-cancel')
            # the manager
            page.click('#manager summary'); page.fill('#mgr-pw', 'wrong password'); page.click('#mgr-login button'); page.wait_for_timeout(300)
            check("isn't right" in page.inner_text('#mgr-status'), 'manager: wrong password refused')
            page.fill('#mgr-pw', 'kopon-test-password'); page.click('#mgr-login button'); page.wait_for_selector('#mgr-edit')
            kept = page.evaluate("sessionStorage.getItem('kopon:mgr')")
            check(kept and 'kopon-test-password' not in kept, 'the page keeps a time-limited pass, not the password')
            page.click('#mgr-edit')
            for pid in ('virgil-van-dijk', 'rio-ngumoha'):
                page.focus(f'#mgr-list .rf-row[data-id="{pid}"] input'); [page.keyboard.press('ArrowRight') for _ in range(5)]
            page.click('#mgr-list .rf-row[data-id="virgil-van-dijk"] .rf-motm'); page.fill('#mgr-note', 'A colossus. <script>alert(1)</script>')
            page.click('#mgr-save'); page.wait_for_selector('.chip[data-view="kopon"][aria-selected="true"]')
            body = page.inner_text('#rate-app')
            check("Kop On’s pick" in body and 'A colossus. <script>alert(1)</script>' in body and A("document.querySelectorAll('.r-note script').length") == 0, 'manager: Kop On’s ratings published with the note (shown as text, never run)')
            c2 = fan_context(browser, ip='10.9.9.9'); p2 = c2.new_page(); p2.goto(BASE + '/fans/ratings/2026-10-21-villarreal/', wait_until='networkidle'); p2.click('#rf-peek'); p2.wait_for_selector('.r-tabs')
            check(p2.locator('.chip[data-view="kopon"]').count() == 1, 'everyone sees the Kop On tab'); c2.close()
            page.click('#mgr-edit'); page.click('#mgr-delete'); page.wait_for_timeout(500)
            check(page.locator('.chip[data-view="kopon"]').count() == 0, 'manager: ratings can be removed again')
            # did the fans call the line-up? (a pretend set of line-up picks for that match)
            vdir = STORE / 'kopon-fans' / 'votes' / 'lineup' / '700083'; vdir.mkdir(parents=True, exist_ok=True)
            xi = ['alisson-becker', 'jeremie-frimpong', 'ibrahima-konate', 'virgil-van-dijk', 'milos-kerkez', 'florian-wirtz', 'ryan-gravenberch', 'dominik-szoboszlai', 'mohamed-salah', 'hugo-ekitike', 'rio-ngumoha']
            (vdir / 'old-voter-00000000001.json').write_text(json.dumps({'vote': {'formation': '4-3-3', 'xi': xi, 'captain': None}}))
            page.reload(wait_until='networkidle'); page.wait_for_selector('#xi-vs:not([hidden])')
            t = page.inner_text('#xi-vs')
            check(re.search(r'9\s*/11', t) and 'Dominik Szoboszlai' in t, f"“Did the fans call it?”: 9 of the fans' XI started")
            check(not errs, 'no JavaScript errors on the ratings page', str(errs[:3]))
            ctx.close()
            # a closed match
            ctx = fan_context(browser); page = ctx.new_page()
            page.goto(BASE + '/fans/ratings/2026-10-04-chelsea/', wait_until='networkidle'); page.wait_for_selector('.r-tabs')
            check('Voting has closed' in page.inner_text('#rate-app') and page.locator('#r-edit').count() == 0, 'old matches: results only')
            ctx.close()
            # the hub, home page and match preview link to it all
            hub = get('/fans/')[1]
            check('Pick your XI v Brighton' in hub and hub.count('href="/fans/ratings/') == 5 and 'See ratings' in hub and 'Rate players' in hub, 'fan zone page: line-up card and five matches (open and closed)')
            check('href="/fans/lineup/"' in get('/')[1] and 'Pick your XI for this match' in get('/stats/2026-10-25-brighton/')[1] and 'Pick your XI' not in get('/stats/2026-10-28-real-madrid/')[1], 'linked from the home page and the next match preview')
            fj = json.loads(get('/data/fans.json')[1])
            check(fj['lineup']['matchId'] == '700090' and len(fj['lineup']['squad']) == 22 and len(fj['rate']) == 5, 'data/fans.json tells the voting function what is open')
            print('\n== Hostile feed (XSS) ==')
            build('--feed', 'nasty-podcast.xml')
            page = browser.new_page(); dialogs = []; errs = []
            page.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
            page.on('pageerror', lambda e: errs.append(str(e)))
            for p in ['/', '/episodes/', '/episodes/quotes-double-single-curly/', '/episodes/dup-title/', '/episodes/dup-title-2/', '/episodes/no-date-no-audio/']:
                r = page.goto(BASE + p, wait_until='networkidle')
                if r.status != 200: dialogs.append(f'{p} HTTP {r.status}')
                for b in page.query_selector_all('.ts, .player-toggle, .play-btn'):
                    try: b.click(timeout=500)
                    except Exception: pass
                page.mouse.move(200, 600); page.wait_for_timeout(150)
            check(not dialogs, 'no script from the feed ever runs', str(dialogs))
            body = get('/episodes/quotes-double-single-curly/')[1]
            notes = body[body.index('class="notes"'):body.index('</article>')]
            check(not re.search(r'<script|onerror|onclick|onmouseover|javascript:|<iframe|<svg|<style', notes, re.I), 'show notes stripped of dangerous markup')
            check('<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="nofollow noopener ugc">good link</a>' in notes, 'safe links kept')
            nd = get('/episodes/no-date-no-audio/')[1]
            check("isn't available here" in nd, 'episode without audio degrades gracefully')
            page.close()
            build()
            browser.close()
    finally:
        if server: server.terminate()

    passed = sum(1 for r in results if r[0])
    print(f'\n{passed}/{len(results)} checks passed')
    if passed != len(results):
        for ok, n, d in results:
            if not ok: print('  FAILED:', n, d)
        sys.exit(1)

if __name__ == '__main__':
    main()
