// Generates test feeds that mimic the real formats:
//  - podcast.xml: Anchor/Spotify-for-Creators RSS (real titles/dates from the current site)
//  - news/*.xml: WordPress RSS2, Reach plc RSS, YouTube Atom
// Run: node test/fixtures/make-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'news'), { recursive: true });

const BOILER = `<p>YNWA!!</p><p>KOP ON YOUTUBE: ➡️ <a href="https://www.youtube.com/c/koponpodcast" target="_blank" rel="noopener noreferrer nofollow"><u>⁠https://www.youtube.com/c/koponpodcast⁠</u></a></p><p>“Kop On!” is a podcast dedicated to the worldwide LFC Family 🌍, for supporters everywhere.</p>`;

// [title, ISO date, duration, notes HTML]
const known = [
  ['Rio the Hero!', '2026-10-22T09:03:20Z', '01:23:00', `<p>An inspired Rio Ngumoha led an extraordinary comeback at Anfield, as Liverpool overcame a 2-0 deficit to win 4-3 against Villareal in the Champions League. The results makes it 3 wins from 3 in this season's UCL for the Reds.</p><p>On the agenda:</p><p>00:00 Intro</p><p>04:12 Rio's second-half masterclass</p><p>31:45 What changed at half-time?</p><p>1:02:30 Brighton preview</p><br/>` + BOILER],
  ['Feeling better!', '2026-10-15T21:50:08Z', '00:34:57', `<p>Nigel joins Owen to discuss a refreshing and terrifically entertaining Champions League clash away at LASK Linz.</p><p>On teh menu:</p><p>- Barcola's superb hat-trick</p><p>- Gravenberch's improved form</p><p>- Wirtz more used to Europe</p><br/>` + BOILER],
  ['Kavanagh Ruins It!', '2026-10-12T20:11:00Z', '00:39:10', `<p>Mick from The Kopite Podcast joins Owen (until a technical error!) to lament Chris Kavanagh and the events that conspired, quite literally, to ruin Liverpool's Sunday.</p><p>- Should an official independent enquiry be launched?</p><p>Kick-off was at 16:30, and it all went wrong after 20 minutes.</p>` + BOILER],
  ['Liverpool vs Man City preview!!', '2026-10-08T18:00:00Z', '01:10:02', `<p>Nigel, Karl Coppack (<a href="https://buymeacoffee.com/example">⁠buy him a coffee⁠</a>!!), Trev Downey (get Great Stories here), and Owen preview Sunday's hotly anticipated match between Liverpool and "Man Cheaty", "Filibuster FC", the club whose long list of charges remains unresolved.</p>` + BOILER],
  ['114: The Facts', '2026-09-28T17:30:00Z', '01:12:00', `<p>Nigel and Neill join Owen to go through the actual facts of the Man City case, according to the people who understand it best.</p><p>Topic discussed include:</p><p>- A breakdown of the charges against Man City</p><p>- City's public face</p>` + BOILER],
  ['Reasons to Believe!', '2026-09-25T12:00:00Z', '00:43:00', `<p>As the pesky international break arrives uninvited at our unwelcoming doors, Nigel joins Owen to stay on topic and talk all things Liverpool, including:</p><p>- Julian Ward to come back: how did he do last time?</p><p>- Alexis Mac Allister's form</p>` + BOILER],
  ['Excessive Celebrations!', '2026-09-20T23:15:00Z', '00:55:00', `<p>Nigel joins Owen post-match as Liverpool become the first team since January to beat Bournemouth, 1-0 at the Vitality Stadium. Isak's goal sent the fans barmy, as a somewhat stodgy performance nevertheless culminated in three points.</p>` + BOILER],
  ['Work In Progress!', '2026-09-14T14:06:08Z', '00:54:00', `<p>After some time away, NIgel joins Owen to reflect on what's gone right and what's gone wrong for Liverpool so far this season. topics include:</p><p>- Why our midfield looks bad</p><p>- Jérémy Jacquet: a duck to water</p>` + BOILER],
  ['Barcola, UCL, and Forest: All Systems Go!!', '2026-08-27T16:00:00Z', '00:46:00', `<p>Douglas joins Owen on a meaty day, upon which a fee has been agreed for Bradley Barcola, the UCL draw has been made, and Andoni Iraola has held a press conference previewing Nottingham Forest's trip to Anfield this weekend.</p>` + BOILER],
  ['Ready! Set! Draw!', '2026-08-25T10:00:00Z', '01:15:00', `<p>Jack⁠ joins Owen to review Newcastle 2-2 Liverpool, where a last-gasp penalty saved a point in Andoni Iraola's first game in charge.</p>` + BOILER],
  ['PL and Newcastle Preview!!!', '2026-08-20T10:00:00Z', '01:04:00', `<p>Dave from Dave's LFC Chats joins Owen to preview the big kick off this weekend!</p>` + BOILER],
  ['Package Deal!', '2026-08-15T10:00:00Z', '01:25:00', `<p>https://www.example.com/a-very-long-link-with-no-spaces-at-all-that-goes-on-and-on-and-on-forever</p><p>Nigel and Abdul from Watch_LFC join Owen to discuss the Bhatia / Bezos / Mittal investment.</p>` + BOILER],
  ['Anfield Irishman special!', '2026-07-10T10:00:00Z', '00:43:00', `<p>Brian, aka The Anfield Irishman joins Nigel and Owen to discuss the latest LFC news.</p>` + BOILER],
  ['Trev Downey Special!', '2026-07-02T10:00:00Z', '00:53:00', `<p>Trev Downey (get Great Stories here) and Nigel join Owen to talk through some of our latest Liverpool FC thoughts.</p>` + BOILER],
  ['Day Zero!', '2026-07-01T10:00:00Z', '00:47:00', `<p>Nigel and Owen discuss the latest Liverpool situation, including Bradley Barcola being too pricey.</p>` + BOILER],
  ["Iraola's Interview (pt. 3), and Darwin to return?", '2026-06-26T10:00:00Z', '01:05:00', `<p>SORRY THIS EPISODE IS LATE!! SORT YOUR SH*T OUT, SPOTIFY!!</p>` + BOILER],
  ["Iraola's Interview (pt.2), and Fare Thee Well, Divock!", '2026-06-13T10:00:00Z', '00:53:00', `<p>Nigel and Brian join Owen to continue our reaction to Andoni Iraola's first interview.</p>` + BOILER],
  ["Iraola's First Interview: Reaction Special! (pt 1)", '2026-06-08T10:00:00Z', '01:06:00', `<p>Karl Coppack (buy him a coffee!!) and Nigel join Owen to react to Iraola's first interview as LFC boss.</p>` + BOILER],
  ['Iraola In!', '2026-06-03T10:00:00Z', '01:11:00', `<p>Lee and Liam join Owen to get all excited about Liverpool FC's new manager, Andoni Iraola.</p>` + BOILER],
  ['Thank You, Arne!', '2026-06-01T10:00:00Z', '00:50:00', `<p>Nigel and Shane join Owen to react to Arne Slot leaving Liverpool FC.</p>` + BOILER],
];

// The other 30 episodes exist on the current site only as URLs; titles here are test stand-ins.
const older = [
  ['reflections-pt-2', '2026-05-29'], ['reflections', '2026-05-27'], ['brentford-preview', '2026-05-22'], ['vanilla-shite', '2026-05-19'],
  ['dog-mud', '2026-05-13'], ['blue-blues-or-raging-reds-chelsea-preview', '2026-05-08'], ['shite-vs-the-shite', '2026-05-05'], ['man-united-preview', '2026-05-01'],
  ['storming-the-palace', '2026-04-28'], ['palace-and-slot-to-stay', '2026-04-24'], ['derby-delight', '2026-04-21'], ['psg-ekitike-everton-and-top-five', '2026-04-17'],
  ['no-mo-mo-and-alonso-in', '2026-03-30'], ['konatwheelin', '2026-02-23'], ['the-force-awakens', '2026-02-02'], ['one-foot-in-the-merde', '2026-01-20'],
  ['sublime-and-ridiculous', '2026-01-14'], ['dishwater', '2026-01-07'], ['brightoning-skies', '2025-12-16'], ['no-salah-no-salah', '2025-12-12'],
  ['james-pearce-walk-on-special', '2025-11-13'], ['how-sh-t-are-we', '2025-11-11'], ['giving-emi-the-eyes', '2025-11-03'], ['pressure', '2025-10-30'],
  ['daylight', '2025-09-22'], ['merseyside-derby-preview', '2025-09-19'], ['karl-coppack-special', '2025-09-17'], ['the-silence-of-the-burnley-fans', '2025-09-15'],
  ['back-for-turf-more', '2025-09-12'], ['va-pensiero-squad-depth-olise-and-rogers', '2025-09-05'],
];
const titleFromSlug = (s) => s.split('-').map((w) => (w === 'sh' ? 'Sh' : w[0].toUpperCase() + w.slice(1))).join(' ').replace('Sh T', 'Sh*t') + '!';

const all = [
  ...known,
  ...older.map(([slug, d], i) => [titleFromSlug(slug), `${d}T19:00:00Z`, `00:${String(35 + (i % 20)).padStart(2, '0')}:00`, `<p>Test episode notes for ${slug}.</p>` + BOILER]),
];

const rfc822 = (iso) => new Date(iso).toUTCString();
const cdata = (s) => `<![CDATA[${s}]]>`;

const items = all.map(([title, iso, dur, html], i) => `
    <item>
      <title>${cdata(title)}</title>
      <description>${cdata(html)}</description>
      <link>https://podcasters.spotify.com/pod/show/koponpodcast/episodes/ep-${i}</link>
      <guid isPermaLink="false">fixture-guid-${String(all.length - i).padStart(3, '0')}</guid>
      <dc:creator>${cdata('Owen Thomas')}</dc:creator>
      <pubDate>${rfc822(iso)}</pubDate>
      <enclosure url="{{AUDIO}}?ep=${i}" length="79691022" type="audio/mpeg"/>
      <itunes:summary>${cdata(html)}</itunes:summary>
      <itunes:explicit>false</itunes:explicit>
      <itunes:duration>${dur}</itunes:duration>
      <itunes:image href="https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_episode/808460/ep-${i}.jpg"/>
      <itunes:season>9</itunes:season>
      <itunes:episode>${Math.max(1, 15 - i)}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
    </item>`).join('');

const podcast = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:anchor="https://anchor.fm/xmlns">
  <channel>
    <title>${cdata('Kop On! A Liverpool FC (LFC) podcast')}</title>
    <description>${cdata('<p>🔴 Welcome to Kop On! - The Hub for Liverpool FC Fans Worldwide! 🔴</p>')}</description>
    <link>https://podcasters.spotify.com/pod/show/koponpodcast</link>
    <image><url>https://d3t3ozftmdmh3i.cloudfront.net/production/podcast_uploaded_nologo/808460/808460-1620331217994-589492511195a.jpg</url><title>Kop On!</title></image>
    <generator>Anchor Podcasts</generator>
    <lastBuildDate>${rfc822('2026-10-22T09:10:00Z')}</lastBuildDate>
    <atom:link href="https://anchor.fm/s/56a3330/podcast/rss" rel="self" type="application/rss+xml"/>
    <author>${cdata('Owen Thomas')}</author>
    <language>${cdata('en')}</language>
    <itunes:author>Owen Thomas</itunes:author>
    <itunes:image href="https://d3t3ozftmdmh3i.cloudfront.net/production/podcast_uploaded_nologo/808460/808460-1620331217994-589492511195a.jpg"/>
    <itunes:category text="Sports"><itunes:category text="Soccer"/></itunes:category>${items}
  </channel>
</rss>
`;
writeFileSync(join(here, 'podcast.xml'), podcast);

// ---- a hostile feed: every trick we can think of -----------------------------
const nasty = `﻿<?xml version="1.0"?>
<!DOCTYPE rss [ <!ENTITY foo "bar"> ]>
<!-- comment with <item> inside -->
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Nasty &amp; Co</title>
<item>
  <title>&lt;script&gt;alert("t")&lt;/script&gt; Quotes "double" &amp; 'single' &#8216;curly&#8217;</title>
  <guid>nasty-1</guid>
  <pubDate>Fri, 23 Oct 2026 08:00:00 BST</pubDate>
  <enclosure url="{{AUDIO}}?ep=nasty" type="audio/mpeg" length="1"/>
  <itunes:duration>2400</itunes:duration>
  <content:encoded><![CDATA[
    <p onclick="alert(1)">Hello <b>bold</b> <i>it</i> <script>alert('x')</script>world</p>
    <img src=x onerror="alert(2)">
    <a href="javascript:alert(3)">bad link</a>
    <a href=" JaVaScRiPt:alert(4)">bad link 2</a>
    <a href="https://example.com/?a=1&amp;b=2" onmouseover="alert(5)">good link</a>
    <iframe src="https://evil.example"></iframe><style>body{display:none}</style>
    <svg><script>alert(6)</script></svg>
    <p>Visit https://www.thisisanfield.com/latest. Now!</p>
    <div>00:00 Intro<br>12:34 Chapter two<br>1:02:03 Too late for a 40 min episode</div>
    <ul><li>one<li>two</ul>
    <p>unclosed <strong>tag
  ]]></content:encoded>
</item>
<item><title>No date, no audio</title><guid>nasty-2</guid><description>plain &amp;amp; text</description></item>
<item><title>Dup Title</title><guid>dup-new</guid><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><enclosure url="{{AUDIO}}?d=2" type="audio/mpeg"/></item>
<item><title>Dup Title</title><guid>dup-old</guid><pubDate>Wed, 21 Oct 2026 10:00:00 GMT</pubDate><enclosure url="{{AUDIO}}?d=1" type="audio/mpeg"/></item>
</channel></rss>`;
writeFileSync(join(here, 'nasty-podcast.xml'), nasty);

// ---- news feeds ------------------------------------------------------------
const hoursAgo = (h) => new Date(Date.parse('2026-10-23T12:00:00Z') - h * 3600000).toUTCString();

const wp = (site, entries) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:wfw="http://wellformedweb.org/CommentAPI/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:atom="http://www.w3.org/2005/Atom"
	xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"
	xmlns:slash="http://purl.org/rss/1.0/modules/slash/"
	xmlns:media="http://search.yahoo.com/mrss/">
<channel>
	<title>${site}</title>
	<atom:link href="https://example.com/feed/" rel="self" type="application/rss+xml" />
	<link>https://example.com</link>
	<language>en-GB</language>
${entries.map(([t, h, slug, img, sum]) => `	<item>
		<title>${t}</title>
		<link>https://www.${slug.split('/')[0]}/${slug.split('/').slice(1).join('/')}/</link>
		<dc:creator><![CDATA[Staff]]></dc:creator>
		<pubDate>${hoursAgo(h)}</pubDate>
		<category><![CDATA[News]]></category>
		<guid isPermaLink="false">https://www.${slug.split('/')[0]}/?p=${h * 7}</guid>
		<description><![CDATA[<p>${sum ? sum.replace(/&/g, '&amp;') : 'Summary of ' + t.replace(/&/g, '&amp;') + '&#8230;'}</p><p>The post ${t.replace(/&/g, '&amp;')} appeared first on ${site}.</p>]]></description>
		<content:encoded><![CDATA[${img ? `<p><img loading="lazy" src="${img}" alt="" width="1200" height="800" /></p>` : ''}<p>Full article body.</p>]]></content:encoded>
	</item>`).join('\n')}
</channel></rss>`;

writeFileSync(join(here, 'news', 'this-is-anfield.xml'), wp('This Is Anfield', [
  ['Bradley Barcola declared fit vs. Brighton as Victor Munoz doubt explained', 1, 'thisisanfield.com/2026/10/barcola-fit', 'https://www.thisisanfield.com/wp-content/uploads/barcola.jpg', 'Andoni Iraola confirmed Bradley Barcola trained fully on Thursday and is available for Saturday. Victor Munoz is a doubt after picking up a knock against Villarreal. Dominik Szoboszlai remains out.'],
  ['Liverpool &#8216;make contact&#8217; for Felix Nmecha in new midfielder search', 3, 'thisisanfield.com/2026/10/nmecha', 'https://www.thisisanfield.com/wp-content/uploads/nmecha.jpg'],
  ['Liverpool vs. Brighton could be in doubt due to storm', 5, 'thisisanfield.com/2026/10/storm', null, 'Met Office warnings for Storm Amy could see Saturday’s game postponed, with a safety meeting at Anfield on Friday afternoon.'],
  ['Harvey Elliott challenged to &#8216;step up&#8217; after Liverpool and Valencia talks', 7, 'thisisanfield.com/2026/10/elliott', 'https://www.thisisanfield.com/wp-content/uploads/elliott.jpg', 'Harvey Elliott has been told he must play regularly as Valencia hold talks with Liverpool over a January loan.'],
  ['Dominik Szoboszlai return timeline revealed after hamstring injury', 11, 'thisisanfield.com/2026/10/szoboszlai', null],
]));

writeFileSync(join(here, 'news', 'empire-of-the-kop.xml'), wp('Empire of the Kop', [
  ['Ian Rush imparts 5-word advice to &#8216;fantastic&#8217; Bradley Barcola after £106m Liverpool move', 2, 'empireofthekop.com/2026/10/rush', 'https://www.empireofthekop.com/wp-content/uploads/rush.jpg'],
  ['Munoz, Frimpong, Szoboszlai: Sky reporter shares multiple Liverpool injury updates live on air', 4, 'empireofthekop.com/2026/10/injuries', null],
  ['&#8216;To this day&#8230;&#8217; &#8211; Jurgen Klopp makes heartbreaking confession over Diogo Jota&#8217;s death', 9, 'empireofthekop.com/2026/10/klopp', null],
]));

writeFileSync(join(here, 'news', 'anfield-online.xml'), wp('Anfield Online', [
  ['Liverpool complete signing of French forward Bradley Barcola', 30, 'anfield-online.co.uk/2026/10/barcola-signs', null],
  ['Andoni Iraola CONFIRMED as new Liverpool FC boss', 24 * 140, 'anfield-online.co.uk/2026/06/iraola', null], // too old: should be dropped
]));

// The Anfield Wrap: duplicate and near-duplicate titles, like the old WordPress widget showed
writeFileSync(join(here, 'news', 'the-anfield-wrap.xml'), wp('The Anfield Wrap', [
  ['Liverpool Face Brighton After European Delight | Friday Live!', 2.5, 'theanfieldwrap.com/2026/10/friday-live', null],
  ['How Balanced Is Liverpools Squad? | The Gutter Transfer Show', 6, 'theanfieldwrap.com/2026/10/gutter-1', null],
  ['How Balanced Is Liverpool’s Squad | The Gutter Transfer Show', 6.5, 'theanfieldwrap.com/2026/10/gutter-2', null],
  ['Liverpool Overturn Villarreal At Anfield | TAW Midweek Extra', 20, 'theanfieldwrap.com/2026/10/midweek', null],
  ['Liverpool Overturn Villarreal At Anfield | TAW Midweek Extra', 21, 'theanfieldwrap.com/2026/10/midweek-dupe', null],
]));

// Reach plc style (Liverpool Echo): CDATA titles, media:content + enclosure images
const echoItems = [
  ['Liverpool attend Harvey Elliott meeting as Valencia in agreement over winger', 1.5],
  ['Bradley Barcola passed fit for Liverpool vs Brighton but Reds set to miss six players', 2.2],
  ["Why Rio Ngumoha could be Andoni Iraola's Liverpool trump card against red-hot Brighton", 3.3],
  ['Referee who made confirmed Liverpool error picked for Reds vs Brighton clash', 8],
];
writeFileSync(join(here, 'news', 'liverpool-echo.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
<channel><title><![CDATA[Liverpool Echo - Liverpool FC]]></title><link>https://www.liverpoolecho.co.uk/all-about/liverpool-fc</link>
${echoItems.map(([t, h], i) => `<item><title><![CDATA[${t}]]></title><link>https://www.liverpoolecho.co.uk/sport/football/football-news/story-${i}</link><guid>https://www.liverpoolecho.co.uk/sport/football/football-news/story-${i}</guid><description><![CDATA[Echo summary ${i}]]></description><pubDate>${hoursAgo(h)}</pubDate><dc:creator>Echo Reporter</dc:creator><media:content url="https://i2-prod.liverpoolecho.co.uk/incoming/article${i}.ece/ALTERNATES/s1200/0_Image.jpg" type="image/jpeg" medium="image"/><enclosure url="https://i2-prod.liverpoolecho.co.uk/incoming/article${i}.ece/ALTERNATES/s1200/0_Image.jpg" length="0" type="image/jpeg"/></item>`).join('\n')}
</channel></rss>`);

// YouTube Atom (not in the default config, but the parser must cope)
writeFileSync(join(here, 'news', 'youtube.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>The Anfield Wrap</title>
 <entry>
  <id>yt:video:abc</id><yt:videoId>abc</yt:videoId>
  <title>Liverpool 4 Villarreal 3 | Post Match Pint</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc"/>
  <published>2026-10-21T22:05:00+00:00</published><updated>2026-10-22T01:00:00+00:00</updated>
  <media:group><media:title>Liverpool 4 Villarreal 3</media:title><media:thumbnail url="https://i2.ytimg.com/vi/abc/hqdefault.jpg" width="480" height="360"/></media:group>
 </entry>
</feed>`);

writeFileSync(join(here, 'news', 'bbc.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel><title><![CDATA[BBC Sport - Liverpool]]></title>
<item><title><![CDATA[Barcola passed fit for Liverpool's game against Brighton]]></title><description><![CDATA[Liverpool forward Bradley Barcola is fit to face Brighton on Saturday after recovering from a hip problem, manager Andoni Iraola says.]]></description><link>https://www.bbc.co.uk/sport/football/articles/c1barcola</link><guid isPermaLink="false">https://www.bbc.co.uk/sport/football/articles/c1barcola#0</guid><pubDate>${hoursAgo(0.5)}</pubDate><media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/ace/standard/240/barcola.jpg"/></item>
<item><title><![CDATA[Elliott in talks over Valencia loan move]]></title><description><![CDATA[Liverpool midfielder Harvey Elliott is in talks over a loan move to Valencia in January, with the Spanish side agreeing terms with the player.]]></description><link>https://www.bbc.co.uk/sport/football/articles/c2elliott</link><pubDate>${hoursAgo(2)}</pubDate></item>
<item><title><![CDATA[Klopp: Jota biography a fitting tribute]]></title><description><![CDATA[Former Liverpool manager Jurgen Klopp says a new biography of Diogo Jota, with proceeds going to charity, is a fitting tribute to the late forward.]]></description><link>https://www.bbc.co.uk/sport/football/articles/c3jota</link><pubDate>${hoursAgo(6)}</pubDate></item>
</channel></rss>`);

writeFileSync(join(here, 'news', 'guardian.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel><title>Liverpool | The Guardian</title>
<item><title>Liverpool’s Barcola fit for Brighton but Szoboszlai still sidelined</title><link>https://www.theguardian.com/football/2026/oct/23/liverpool-barcola-fit-brighton</link><description>&lt;p&gt;Bradley Barcola will be available for Liverpool against Brighton, while Dominik Szoboszlai’s hamstring injury will keep him out until after the international break.&lt;/p&gt; &lt;a href="https://www.theguardian.com/football/2026/oct/23/liverpool-barcola-fit-brighton"&gt;Continue reading...&lt;/a&gt;</description><pubDate>${hoursAgo(1.2)}</pubDate><media:content width="140" url="https://i.guim.co.uk/img/media/barcola/master/140.jpg"/></item>
<item><title>Storm Amy threatens Liverpool v Brighton at Anfield</title><link>https://www.theguardian.com/football/2026/oct/23/storm-liverpool-brighton</link><description>&lt;p&gt;Saturday’s match at Anfield could be postponed if forecasts of 80mph winds prove accurate, with a safety meeting scheduled for Friday afternoon.&lt;/p&gt;</description><pubDate>${hoursAgo(4)}</pubDate></item>
</channel></rss>`);

console.log('fixtures written');
