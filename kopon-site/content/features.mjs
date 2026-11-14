// Stats features: short written pieces with a table, published at /stats/<slug>/ and linked from the Stats page.
// Each player's seasons are [tackles, interceptions, clearances, own shots blocked (not shown), recoveries, minutes]; null = no data.
// `teaser` is the short summary shown under the headline at the top of the Stats page.
// A feature with several tables lists them under `tables`; a table can name its own `metrics` (minutes always last). Newest feature first.
export default [
  {
    slug: 'six-midfielders-compared',
    title: 'Six midfielders compared: who should Liverpool sign?',
    short: 'Six midfielders compared',
    date: '2026-11-14',
    description: 'Lamine Camara, Arthur Avom, Alex Scott and Manu Koné measured against Szoboszlai and Gravenberch in defence and attack, and the one we would sign for Liverpool.',
    teaser: 'Camara, Avom, Scott and Koné measured against Szoboszlai and Gravenberch, in defence and in attack. One of them wins the ball more than anyone here and creates more than everyone except Szoboszlai: he is our pick to sign.',
    lede: 'We measured four midfielders Liverpool could sign (Lamine Camara, Arthur Avom, Alex Scott and Manu Koné) against Dominik Szoboszlai and Ryan Gravenberch, in defence and in attack. Our pick is Lamine Camara.',
    body: [
      ['Our pick: Lamine Camara', [
        'The Monaco midfielder is the best all-rounder of the four. Of all six players he ranks first for tackles (2.81 per 90), recoveries (7.37) and tackles and interceptions combined (4.20), and second for interceptions (1.39), just behind Gravenberch.',
        'He is not only a ball-winner. Only Szoboszlai beats him for goals and assists (0.28 per 90), expected goals and assists (0.25) and chances created (1.66). That is 6 goals and 16 assists in 7,056 league minutes since 2023–24.',
      ]],
      ['Why not the others?', [
        'Alex Scott is the runner-up and the safer choice, because he has done it in the Premier League. He makes the most clearances of the six (2.06 per 90) and is second for recoveries, shots, shots on target and touches in the box. But 7 goals and assists in 5,062 minutes (0.12 per 90) is the lowest return here apart from Avom’s.',
        'Arthur Avom tackles almost as much as Camara (2.64 per 90, and 3.90 tackles and interceptions), but we only have 2,794 Ligue 1 minutes to judge him on and he has the lowest rate of goals and assists, shots and shots on target.',
        'Manu Koné is the best dribbler in the group (1.24 completed per 90), but he is fifth or sixth of six for tackles, interceptions, clearances and recoveries.',
      ]],
      ['What Camara would add', [
        'Szoboszlai is Liverpool’s best attacking midfielder by a distance, but he is last of the six for tackles and interceptions (2.05 per 90). Gravenberch reads the game well, but he is last for recoveries (4.83). Camara wins the ball more often than either, and creates almost twice as many chances as Gravenberch (1.66 against 0.87).',
        'The weakness: he rarely gets into the penalty area (0.66 touches in the box per 90, the fewest here) and has few shots on target.',
      ]],
      ['The small print', [
        'This is our opinion, based only on these league numbers. Ligue 1 is not the Premier League, so the figures will not carry over one for one, and we have not weighed up fees, contracts, injuries or whether Monaco would sell.',
      ]],
    ],
    seasons: ['2023–24', '2024–25', '2025–26', '2026–27'],
    highlight: 'Camara',
    tables: [
      {
        heading: 'Defending',
        players: {
        Szoboszlai: [[30, 14, 13, 23, 170, 2106], [41, 9, 15, 25, 133, 2491], [56, 29, 58, 24, 184, 3231], [8, 4, 9, 4, 37, 571]],
        Gravenberch: [[27, 15, 11, 7, 72, 1121], [70, 56, 59, 7, 193, 3159], [58, 44, 55, 13, 127, 2992], [8, 6, 10, 3, 17, 344]],
        Camara: [[66, 27, 33, 9, 182, 2255], [65, 30, 31, 9, 152, 2054], [58, 38, 18, 8, 159, 1847], [31, 14, 10, 3, 85, 900]],
        Avom: [null, null, [56, 28, 24, 6, 123, 2118], [26, 11, 6, 2, 48, 676]],
        Scott: [[25, 11, 17, 5, 63, 1012], [26, 9, 12, 4, 53, 756], [60, 35, 80, 14, 197, 2849], [9, 8, 7, 4, 35, 445]],
        'Koné': [[46, 14, 15, 7, 110, 1561], [41, 26, 28, 14, 131, 2572], [48, 20, 27, 9, 126, 2456], [10, 4, 2, 3, 27, 473]],
        },
      },
      {
        heading: 'Attacking',
        // [goals, assists, shots, shots on target, chances created, xG, xA, dribbles completed, touches in the box, minutes]
        metrics: [['Minutes', null], ['Goals + assists', [0, 1]], ['xG + xA', [5, 6]], ['Shots', [2]], ['Shots on target', [3]], ['Chances created', [4]], ['Dribbles completed', [7]], ['Touches in opposition box', [8]]],
        players: {
        Szoboszlai: [[3, 2, 60, 15, 55, 3.74, 5.07, 22, 76, 2106], [6, 6, 67, 23, 55, 7.18, 6.01, 20, 107, 2491], [6, 7, 71, 23, 75, 4.64, 6.98, 24, 68, 3231], [1, 1, 15, 5, 18, 1.55, 1.63, 3, 1, 571]],
        Gravenberch: [[1, 0, 23, 8, 14, 1.98, 1.37, 24, 44, 1121], [0, 4, 20, 5, 26, 1.11, 3.38, 35, 28, 3159], [5, 3, 38, 13, 29, 1.76, 2.3, 29, 31, 2992], [0, 1, 5, 2, 5, 0.13, 0.17, 4, 2, 344]],
        Camara: [[1, 4, 30, 9, 41, 2.18, 2.72, 25, 11, 2255], [2, 7, 26, 9, 45, 2.3, 5.01, 11, 17, 2054], [3, 4, 25, 4, 34, 1.98, 4.24, 16, 21, 1847], [0, 1, 8, 2, 10, 0.44, 0.7, 8, 3, 900]],
        Avom: [null, null, [2, 1, 21, 6, 31, 1.1, 3.05, 22, 37, 2118], [0, 0, 6, 0, 10, 0.26, 1.25, 4, 7, 676]],
        Scott: [[1, 1, 15, 4, 22, 0.73, 1.1, 14, 29, 1012], [0, 0, 15, 7, 11, 0.75, 1.05, 6, 17, 756], [3, 1, 44, 13, 23, 3.75, 2.98, 24, 50, 2849], [1, 0, 7, 1, 11, 0.63, 0.43, 4, 15, 445]],
        'Koné': [[1, 0, 24, 8, 24, 1.16, 0.77, 33, 36, 1561], [2, 1, 34, 9, 19, 3.03, 1.56, 28, 45, 2572], [2, 3, 21, 5, 25, 1.89, 2.63, 28, 43, 2456], [2, 0, 9, 3, 7, 1.06, 0.45, 8, 11, 473]],
        },
      },
    ],
    notes: [
      'Szoboszlai and Gravenberch (Liverpool), Lamine Camara (Metz in 2023–24, then Monaco), Arthur Avom (Lorient), Alex Scott (Bournemouth), Manu Koné (Borussia Mönchengladbach in 2023–24, then Roma).',
      'Domestic league matches only (Premier League, Ligue 1, Serie A and the Bundesliga). 2026–27 is the season so far, so those samples are small.',
      'Avom has no figures before 2025–26, when Lorient were promoted to Ligue 1. “xG + xA” is expected goals plus expected assists.',
      'Totals from StatMuse; per-90 rates worked out by Kop On!',
    ],
    sourceUrl: 'https://www.statmuse.com/fc',
  },
  {
    slug: 'gravenberch-v-the-midfield',
    title: 'Gravenberch v the midfield: the defensive numbers',
    short: 'Gravenberch v the midfield',
    date: '2026-11-14',
    description: "Ryan Gravenberch's tackles, interceptions, clearances and recoveries against Szoboszlai, Mac Allister and Curtis Jones over four league seasons.",
    teaser: 'Four league seasons of tackles, interceptions, clearances and recoveries. Gravenberch reads the game better than Szoboszlai, Mac Allister and Jones, but he comes last for winning the ball back.',
    lede: 'How does Ryan Gravenberch’s defensive work stack up against Dominik Szoboszlai, Alexis Mac Allister and Curtis Jones? We put four league seasons side by side.',
    body: [
      ['How to read it', [
        'Each cell shows the season total, with the rate per 90 minutes in brackets. Within each stat the players are ranked best to worst by their per-90 rate across all four seasons (the last column), which is fairer than raw totals because their minutes differ so much.',
      ]],
      ['What it shows', [
        'Gravenberch leads the group for interceptions (1.43 per 90) and clearances (1.60 per 90): the reading-the-game numbers you want from a number six. He is second for tackles and interceptions combined.',
        'Mac Allister is the tackler, with 2.76 per 90, although his rate dropped sharply in 2025–26. Jones wins the ball back most often (5.87 recoveries per 90), ahead of Szoboszlai (5.61).',
        'Where Gravenberch comes last is recoveries (4.83 per 90). They fell from 5.50 to 3.82 per 90 between 2024–25 and 2025–26.',
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
