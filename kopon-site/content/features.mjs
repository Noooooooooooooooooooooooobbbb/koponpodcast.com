// Stats features: short written pieces with a table, published at /stats/<slug>/ and linked from the Stats page.
// Each player's seasons are [tackles, interceptions, clearances, shots blocked, recoveries, minutes]; null = no data.
export default [
  {
    slug: 'gravenberch-v-the-midfield',
    title: 'Gravenberch v the midfield: the defensive numbers',
    short: 'Gravenberch v the midfield',
    date: '2026-11-14',
    description: "Ryan Gravenberch's tackles, interceptions, clearances, blocks and recoveries against Szoboszlai, Mac Allister and Curtis Jones over four league seasons.",
    lede: 'How does Ryan Gravenberch’s defensive work stack up against Dominik Szoboszlai, Alexis Mac Allister and Curtis Jones? We put four league seasons side by side.',
    body: [
      ['How to read it', [
        'Each cell shows the season total, with the rate per 90 minutes in brackets. Within each stat the players are ranked best to worst by their per-90 rate across all four seasons (the last column), which is fairer than raw totals because their minutes differ so much.',
      ]],
      ['What it shows', [
        'Gravenberch leads the group for interceptions (1.43 per 90) and clearances (1.60 per 90): the reading-the-game numbers you want from a number six. He is second for tackles and interceptions combined.',
        'Mac Allister is the tackler, with 2.76 per 90, although his rate dropped sharply in 2025–26. Szoboszlai blocks the most shots (0.81 per 90) and Jones wins the ball back most often (5.87 recoveries per 90).',
        'Where Gravenberch comes last is recoveries (4.83 per 90) and shots blocked (0.35 per 90). His recoveries fell from 5.50 to 3.82 per 90 between 2024–25 and 2025–26.',
      ]],
    ],
    seasons: ['2023–24', '2024–25', '2025–26', '2026–27'],
    highlight: 'Gravenberch',
    players: {
      Gravenberch: [[27, 15, 11, 7, 72, 1121], [70, 56, 59, 7, 193, 3159], [58, 44, 55, 13, 127, 2992], [8, 6, 10, 3, 17, 344]],
      Szoboszlai: [[30, 14, 13, 23, 170, 2106], [41, 9, 15, 25, 133, 2491], [56, 29, 58, 24, 184, 3231], [8, 4, 9, 4, 37, 571]],
      'Mac Allister': [[98, 32, 26, 19, 195, 2601], [94, 22, 29, 13, 148, 2601], [54, 18, 36, 20, 112, 2659], [18, 7, 15, 3, 49, 758]],
      Jones: [[28, 7, 7, 7, 72, 1165], [39, 7, 8, 15, 99, 1712], [39, 18, 31, 6, 142, 1937], [3, 2, 3, 2, 11, 153]],
    },
    marks: { Jones: { 3: '*' } },
    notes: [
      'League matches only. 2026–27 covers Liverpool’s first 10 league games, so those samples are small (Gravenberch has played 344 minutes).',
      '* Curtis Jones’s 2026–27 figures are for Inter in Serie A.',
      'Totals from StatMuse; per-90 rates worked out by Kop On!',
    ],
    sourceUrl: 'https://www.statmuse.com/fc',
  },
];
