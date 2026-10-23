"""End-to-end browser tests for the Kop On! site.

Needs: Python 3 + Playwright (pip install playwright && playwright install chromium).
Run:   python3 test/browser_test.py        (builds fixture sites and starts its own server)
"""
import json, os, re, subprocess, sys, time, html.parser, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8899
BASE = f'http://127.0.0.1:{PORT}'
SHOTS = Path(os.environ.get('SHOTS', ROOT / 'test' / 'screenshots'))
SHOTS.mkdir(parents=True, exist_ok=True)
EXTERNAL_NOISE = ('fonts.googleapis', 'fonts.gstatic', 'thisisanfield.com', 'liverpoolecho', 'empireofthekop', 'hyvor', 'comments.example.com', 'ERR_', 'net::')

results = []
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
        server = subprocess.Popen(['node', 'scripts/dev-server.mjs', '--fixtures', '--port', str(PORT)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        for _ in range(50):
            try: urllib.request.urlopen(BASE + '/'); break
            except Exception: time.sleep(0.1)

        print('\n== Static HTML: every page in the sitemap ==')
        st, sm = get('/sitemap.xml')
        paths = [re.sub(r'^https?://[^/]+', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', sm)]
        check(st == 200 and len(paths) == 50 + 7, f'sitemap lists {len(paths)} URLs')
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
            sample = ['/', '/episodes/', '/episodes/rio-the-hero/', '/episodes/iraola-s-interview-pt-3-and-darwin-to-return/', '/news/', '/community/', '/community/the-terrace/', '/missing/']
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
            check(n_all == 16, f'news page: 16 unique headlines after dedupe and age filter ({n_all})')
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
            check(baked_empty and page.evaluate("document.querySelectorAll('.news-card, .news-row').length") == 16, 'empty build: live /api/news fills the page')
            page.close()
            build()
            get('/__api-mode?m=fail')
            page = browser.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/news/', wait_until='networkidle'); page.wait_for_timeout(400)
            check(page.evaluate("document.querySelectorAll('.news-card, .news-row').length") == 16 and not errs, 'API down: baked headlines stay, no errors')
            page.close()
            get('/__api-mode?m=ok')
            st, api = get('/api/news')
            data = json.loads(api)
            check(st == 200 and len(data['items']) == 16 and all('errors' in s for s in data['sources']), '/api/news returns JSON with per-site status')

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
            notes = body[body.index('class="notes"'):body.index('id="comments"')]
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
