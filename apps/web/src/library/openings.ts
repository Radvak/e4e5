/**
 * The openings of the library ("Bibliothèque"): what each one is for, its key ideas and its main
 * lines, written for the app (French and English). Moves in SAN, as shown everywhere in the app.
 * Main lines checked against the Lichess opening explorer, Wikipedia and 365chess; every line is
 * replayed by openings.test.ts (legal moves, notes on existing plies).
 */
import type { LibraryOpening } from './lines';

export const OPENINGS: LibraryOpening[] = [
  // --- White ------------------------------------------------------------------------------
  {
    slug: 'london',
    color: 'white',
    name: { fr: 'Système de Londres', en: 'London System' },
    eco: 'D02 · A46 · A48',
    moves: 'd4 d5 Bf4',
    difficulty: 1,
    tagline: {
      fr: 'Le même plan contre presque tout : peu de théorie, beaucoup de parties.',
      en: 'The same setup against almost anything: little theory, lots of games.',
    },
    summary: {
      fr: 'Plus un système qu’une ouverture : les Blancs installent presque toujours le même dispositif (d4, Bf4, e3, Nf3, Bd3, c3, Nbd2), quoi que jouent les Noirs. Peu de théorie à retenir et des plans clairs, ce qui en fait un très bon choix pour commencer avec 1.d4.',
      en: 'More a system than an opening: White sets up almost always the same way (d4, Bf4, e3, Nf3, Bd3, c3, Nbd2), whatever Black plays. Little theory to remember and clear plans, which makes it a very good choice to start with 1.d4.',
    },
    ideas: [
      {
        fr: 'Le fou sort en f4 avant de jouer e3 : sinon il resterait enfermé derrière ses propres pions.',
        en: 'The bishop goes to f4 before e3: otherwise it would stay locked behind its own pawns.',
      },
      {
        fr: 'La pyramide de pions c3-d4-e3 donne un centre très solide, difficile à attaquer.',
        en: 'The c3-d4-e3 pawn pyramid makes a very solid centre, hard to attack.',
      },
      {
        fr: 'Le cavalier en e5 sert de base pour attaquer le roque noir (Qf3, g4, h4), et le fou d3 vise h7.',
        en: 'A knight on e5 is the base for an attack on Black’s king (Qf3, g4, h4), and the d3 bishop aims at h7.',
      },
      {
        fr: 'Attention à ...c5 suivi de ...Qb6 : la dame noire vise b2, qui n’est plus défendu depuis que le fou a quitté c1.',
        en: 'Watch out for ...c5 followed by ...Qb6: Black’s queen hits b2, no longer defended once the bishop has left c1.',
      },
      {
        fr: 'Si les Noirs jouent ...Bd6 pour échanger le fou f4, on recule en g3 : après ...Bxg3 hxg3, la colonne h s’ouvre pour la tour.',
        en: 'If Black plays ...Bd6 to trade the f4 bishop, retreat to g3: after ...Bxg3 hxg3, the h-file opens for the rook.',
      },
    ],
    lines: [
      {
        name: { fr: 'Contre ...d5 et ...c5 (ligne principale)', en: 'Against ...d5 and ...c5 (main line)' },
        moves: 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3',
        notes: {
          3: { fr: 'Le fou sort avant e3.', en: 'The bishop comes out before e3.' },
          6: { fr: 'La réaction la plus fréquente : les Noirs attaquent d4.', en: 'The most common reaction: Black attacks d4.' },
          7: { fr: 'La pyramide c3-d4-e3 tient le centre.', en: 'The c3-d4-e3 pyramid holds the centre.' },
          12: { fr: 'Les Noirs proposent l’échange du fou f4.', en: 'Black offers to trade the f4 bishop.' },
          13: { fr: 'On garde le fou : si ...Bxg3, hxg3 ouvre la colonne h.', en: 'Keep the bishop: if ...Bxg3, hxg3 opens the h-file.' },
          15: { fr: 'Dispositif complet : roque, puis Ne5 ou e4 selon la position.', en: 'Setup complete: castle, then Ne5 or e4 depending on the position.' },
        },
      },
      {
        name: { fr: 'La menace ...Qb6 sur b2', en: 'The ...Qb6 threat on b2' },
        moves: 'd4 d5 Bf4 Nf6 e3 c5 c3 Qb6 Qb3 Nc6 Nd2 Bf5 Ngf3 e6',
        notes: {
          8: { fr: 'La dame vise b2, qui n’est plus défendu par le fou c1.', en: 'The queen hits b2, no longer defended by the c1 bishop.' },
          9: {
            fr: 'On défend b2 en proposant l’échange des dames. Si ...Qxb3, axb3 ouvre la colonne a pour la tour.',
            en: 'Defend b2 by offering a queen trade. If ...Qxb3, axb3 opens the a-file for the rook.',
          },
          11: { fr: 'Développement normal : le cavalier va en d2, pas en c3 (c3 est pour le pion).', en: 'Normal development: the knight goes to d2, not c3 (c3 is for the pawn).' },
        },
      },
      {
        name: { fr: 'Contre le fianchetto (...g6)', en: 'Against the fianchetto (...g6)' },
        moves: 'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 c5 c3',
        notes: {
          4: { fr: 'Les Noirs préparent ...Bg7 : pas de pion en d5 à attaquer, on joue tranquille.', en: 'Black prepares ...Bg7: no d5 pawn to attack, play quietly.' },
          9: { fr: 'Contre ...g6, le fou est mieux en e2 : en d3, il taperait dans le pion g6.', en: 'Against ...g6 the bishop is better on e2: on d3 it would bite on the g6 pawn.' },
          11: { fr: 'Une case de retraite en h2 pour le fou, et plus de ...Nh5 ou ...Bg4 gênants.', en: 'A retreat square on h2 for the bishop, and no annoying ...Nh5 or ...Bg4.' },
          13: { fr: 'Toujours la même pyramide c3-d4-e3.', en: 'Always the same c3-d4-e3 pyramid.' },
        },
      },
    ],
    lichess: 'London_System',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/Syst%C3%A8me_de_Londres', en: 'https://en.wikipedia.org/wiki/London_System' },
  },
  {
    slug: 'italian',
    color: 'white',
    name: { fr: 'Partie italienne', en: 'Italian Game' },
    eco: 'C50 – C54',
    moves: 'e4 e5 Nf3 Nc6 Bc4',
    difficulty: 1,
    tagline: {
      fr: 'Développement rapide et pression sur f7 : la base de 1.e4 e5.',
      en: 'Quick development and pressure on f7: the basics of 1.e4 e5.',
    },
    summary: {
      fr: 'Après 1.e4 e5 2.Nf3 Nc6 3.Bc4, le fou vise f7, la case la plus faible du camp noir (défendue seulement par le roi). Les Blancs se développent vite, roquent tôt, puis choisissent entre le plan c3-d4 (grand centre) et un jeu lent avec d3, le Giuoco Pianissimo, très joué à haut niveau.',
      en: 'After 1.e4 e5 2.Nf3 Nc6 3.Bc4, the bishop aims at f7, the weakest square in Black’s camp (defended only by the king). White develops quickly, castles early, then picks between the c3-d4 plan (a big centre) and a slow game with d3, the Giuoco Pianissimo, very popular at the top level.',
    },
    ideas: [
      { fr: 'Le fou c4 vise f7 : la plupart des attaques rapides passent par cette case.', en: 'The c4 bishop aims at f7: most quick attacks go through that square.' },
      { fr: 'c3 prépare d4 pour construire un grand centre, et ouvre une case de retraite au fou en b3.', en: 'c3 prepares d4 to build a big centre, and opens a retreat square on b3 for the bishop.' },
      {
        fr: 'Version lente (Giuoco Pianissimo) : c3, d3, roque, Re1, puis le cavalier b1 voyage par d2 et f1 jusqu’en g3.',
        en: 'Slow version (Giuoco Pianissimo): c3, d3, castle, Re1, then the b1 knight travels via d2 and f1 to g3.',
      },
      { fr: 'Contre 3...Nf6 (défense des deux cavaliers), 4.Ng5 attaque f7 tout de suite.', en: 'Against 3...Nf6 (Two Knights Defence), 4.Ng5 attacks f7 at once.' },
      {
        fr: 'Piège à connaître : après 4.Ng5 d5 5.exd5, si les Noirs reprennent 5...Nxd5?, 6.Nxf7! (attaque Fried Liver) met leur roi en grand danger.',
        en: 'Trap to know: after 4.Ng5 d5 5.exd5, if Black recaptures 5...Nxd5?, 6.Nxf7! (the Fried Liver Attack) puts their king in great danger.',
      },
    ],
    lines: [
      {
        name: { fr: 'Giuoco Pianissimo (jeu lent avec d3)', en: 'Giuoco Pianissimo (slow play with d3)' },
        moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 Nbd2',
        notes: {
          5: { fr: 'Le fou vise f7.', en: 'The bishop aims at f7.' },
          7: { fr: 'Prépare d4 et ouvre la case b3 au fou.', en: 'Prepares d4 and opens b3 for the bishop.' },
          9: { fr: 'Version lente : e4 est protégé, d4 viendra plus tard.', en: 'Slow version: e4 is protected, d4 will come later.' },
          14: { fr: 'Les Noirs préparent une retraite en a7 pour leur fou, à l’abri de d4 et b4.', en: 'Black prepares a retreat on a7 for their bishop, safe from d4 and b4.' },
          17: { fr: 'Le cavalier ira en f1 puis g3 : la manœuvre typique de l’Italienne.', en: 'The knight heads for f1 and then g3: the typical Italian manoeuvre.' },
        },
      },
      {
        name: { fr: 'Giuoco Piano : le plan c3-d4', en: 'Giuoco Piano: the c3-d4 plan' },
        moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5 exd5 Nxd5 Qb3 Nce7 O-O O-O',
        notes: {
          9: { fr: 'Le grand centre : les Noirs doivent réagir tout de suite.', en: 'The big centre: Black must react at once.' },
          12: { fr: 'L’échec gagne un temps et fait reculer la pression.', en: 'The check gains time and eases the pressure.' },
          16: { fr: 'Indispensable : les Noirs cassent le centre avant e5.', en: 'Essential: Black breaks the centre before e5.' },
          19: { fr: 'La dame vise d5 et b7.', en: 'The queen hits d5 and b7.' },
          22: { fr: 'Les Blancs ont un pion isolé en d4 : de l’activité contre une faiblesse.', en: 'White has an isolated pawn on d4: activity in exchange for a weakness.' },
        },
      },
      {
        name: { fr: 'Défense des deux cavaliers : 4.Ng5', en: 'Two Knights Defence: 4.Ng5' },
        moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5',
        notes: {
          7: { fr: 'Cavalier et fou attaquent f7 ensemble.', en: 'Knight and bishop attack f7 together.' },
          8: { fr: 'La bonne défense : couper la diagonale du fou.', en: 'The right defence: cut the bishop’s diagonal.' },
          10: { fr: 'Pas 5...Nxd5? à cause de 6.Nxf7! Les Noirs chassent le fou.', en: 'Not 5...Nxd5? because of 6.Nxf7! Black chases the bishop.' },
          14: { fr: 'Les Noirs ont donné un pion contre une avance de développement.', en: 'Black has given a pawn for a lead in development.' },
          19: { fr: 'Le cavalier s’installe en e5 : les Blancs gardent le pion de plus.', en: 'The knight settles on e5: White keeps the extra pawn.' },
        },
      },
      {
        name: { fr: 'Piège : l’attaque Fried Liver', en: 'Trap: the Fried Liver Attack' },
        trap: true,
        moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3',
        notes: {
          10: { fr: 'L’erreur classique : le cavalier d5 devient une cible.', en: 'The classic mistake: the d5 knight becomes a target.' },
          11: { fr: 'Sacrifice du cavalier pour attirer le roi au centre.', en: 'Knight sacrifice to drag the king into the centre.' },
          13: { fr: 'Échec, et le cavalier d5 est attaqué deux fois.', en: 'Check, and the d5 knight is attacked twice.' },
          15: { fr: 'Encore une pièce sur d5 : le roi noir est exposé pour longtemps.', en: 'One more piece on d5: Black’s king will stay exposed for a long time.' },
        },
      },
    ],
    lichess: 'Italian_Game',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/Partie_italienne', en: 'https://en.wikipedia.org/wiki/Italian_Game' },
  },
  {
    slug: 'queens-gambit',
    color: 'white',
    name: { fr: 'Gambit dame', en: 'Queen’s Gambit' },
    eco: 'D06 – D69',
    moves: 'd4 d5 c4',
    difficulty: 2,
    tagline: {
      fr: 'Un classique : un pion de côté contre le contrôle du centre.',
      en: 'A classic: a side pawn for control of the centre.',
    },
    summary: {
      fr: 'Avec 1.d4 d5 2.c4, les Blancs offrent le pion c4 pour détourner le pion d5 du centre. Ce n’est pas vraiment un gambit : si les Noirs veulent garder le pion, ils le paient cher. Une des ouvertures les plus solides de l’histoire des échecs, jouée à tous les niveaux.',
      en: 'With 1.d4 d5 2.c4, White offers the c4 pawn to lure the d5 pawn away from the centre. It is not really a gambit: if Black tries to keep the pawn, it costs them dearly. One of the most solid openings in chess history, played at every level.',
    },
    ideas: [
      { fr: 'c4 attaque d5 : si les Noirs prennent, e4 permet aux Blancs de prendre tout le centre.', en: 'c4 attacks d5: if Black takes, e4 lets White grab the whole centre.' },
      {
        fr: 'Après 2...dxc4 (gambit accepté), pas besoin de courir après le pion : e3 puis Bxc4 le récupèrent naturellement.',
        en: 'After 2...dxc4 (Queen’s Gambit Accepted), no need to chase the pawn: e3 then Bxc4 win it back naturally.',
      },
      {
        fr: 'Contre 2...e6 (gambit refusé), développement classique Nc3, Bg5, e3, Nf3 et pression sur d5.',
        en: 'Against 2...e6 (Queen’s Gambit Declined), classical development Nc3, Bg5, e3, Nf3 and pressure on d5.',
      },
      {
        fr: 'Après l’échange cxd5 exd5, plan typique : l’attaque de minorité, b4-b5 pour créer une faiblesse en c6.',
        en: 'After the cxd5 exd5 exchange, a typical plan is the minority attack: b4-b5 to create a weakness on c6.',
      },
      {
        fr: 'Piège de l’éléphant : dans le gambit refusé, prendre le pion d5 avec le cavalier quand il est cloué peut coûter une pièce.',
        en: 'The Elephant Trap: in the Declined, taking the d5 pawn with the knight when it looks pinned can lose a piece.',
      },
    ],
    lines: [
      {
        name: { fr: 'Gambit dame refusé (2...e6)', en: 'Queen’s Gambit Declined (2...e6)' },
        moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5',
        notes: {
          3: { fr: 'Le pion c4 attaque d5.', en: 'The c4 pawn attacks d5.' },
          4: { fr: 'Les Noirs tiennent d5 avec un pion : solide, mais le fou c8 est enfermé.', en: 'Black holds d5 with a pawn: solid, but the c8 bishop is locked in.' },
          7: { fr: 'Cloue le cavalier qui défend d5.', en: 'Pins the knight that defends d5.' },
          13: { fr: 'La tour se place sur la colonne c, qui va s’ouvrir.', en: 'The rook goes to the c-file, which is about to open.' },
          17: { fr: 'Les Noirs ont gagné un temps : les Blancs ont joué Bd3 puis Bxc4.', en: 'Black has gained a tempo: White played Bd3 and then Bxc4.' },
          18: { fr: 'Manœuvre de libération : les Noirs échangent des pièces pour respirer.', en: 'Freeing manoeuvre: Black trades pieces to get some air.' },
        },
      },
      {
        name: { fr: 'Gambit dame accepté (2...dxc4)', en: 'Queen’s Gambit Accepted (2...dxc4)' },
        moves: 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
        notes: {
          4: { fr: 'Les Noirs ne gardent pas le pion : ils libèrent leur jeu.', en: 'Black will not keep the pawn: they free their game.' },
          5: { fr: 'Empêche ...e5 et développe.', en: 'Stops ...e5 and develops.' },
          9: { fr: 'Le pion est récupéré, les Blancs ont un beau centre.', en: 'The pawn is back, and White has a fine centre.' },
          10: { fr: 'Les Noirs attaquent d4 à leur tour.', en: 'Black attacks d4 in turn.' },
        },
      },
      {
        name: { fr: 'Défense slave (2...c6)', en: 'Slav Defence (2...c6)' },
        moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O',
        notes: {
          4: { fr: 'Les Noirs tiennent d5 sans enfermer leur fou c8.', en: 'Black holds d5 without locking in their c8 bishop.' },
          8: { fr: 'Les Noirs prennent quand même, prêts à défendre le pion avec ...b5.', en: 'Black takes anyway, ready to defend the pawn with ...b5.' },
          9: { fr: 'Empêche ...b5 : le pion c4 tombera.', en: 'Stops ...b5: the c4 pawn will fall.' },
          13: { fr: 'Pion récupéré, développement simple.', en: 'Pawn regained, simple development.' },
        },
      },
      {
        name: { fr: 'Piège de l’éléphant', en: 'The Elephant Trap' },
        trap: true,
        moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8',
        notes: {
          8: { fr: 'Le cavalier f6 semble cloué : il ne l’est pas vraiment.', en: 'The f6 knight looks pinned: it is not really.' },
          11: { fr: 'L’erreur : le pion d5 a l’air gratuit.', en: 'The mistake: the d5 pawn looks free.' },
          12: { fr: 'Les Noirs abandonnent leur dame !', en: 'Black gives up their queen!' },
          14: { fr: 'L’échec qui récupère la dame.', en: 'The check that wins the queen back.' },
          18: { fr: 'Bilan : les Noirs ont une pièce de plus.', en: 'Result: Black is a piece up.' },
        },
      },
    ],
    lichess: 'Queens_Gambit',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/Gambit_dame', en: 'https://en.wikipedia.org/wiki/Queen%27s_Gambit' },
  },

  // --- Black ------------------------------------------------------------------------------
  {
    slug: 'caro-kann',
    color: 'black',
    name: { fr: 'Défense Caro-Kann', en: 'Caro-Kann Defence' },
    eco: 'B10 – B19',
    moves: 'e4 c6 d4 d5',
    difficulty: 1,
    tagline: {
      fr: 'La défense solide contre 1.e4 : structure saine, peu de pièges.',
      en: 'The solid answer to 1.e4: a sound structure and few traps.',
    },
    summary: {
      fr: 'Avec 1...c6 puis 2...d5, les Noirs contestent le centre tout de suite, sans enfermer leur fou c8 comme dans la défense française. Solide, avec des structures claires et peu de pièges : un très bon choix pour débuter avec les Noirs contre 1.e4.',
      en: 'With 1...c6 then 2...d5, Black challenges the centre at once, without locking in their c8 bishop as in the French Defence. Solid, with clear structures and few traps: a very good choice to start with Black against 1.e4.',
    },
    ideas: [
      { fr: '...c6 prépare ...d5 : le pion d5 est soutenu sans gêner le fou c8.', en: '...c6 prepares ...d5: the d5 pawn is supported without blocking the c8 bishop.' },
      { fr: 'Le fou c8 sort (Bf5 ou Bg4) avant ...e6 : c’est tout l’intérêt de l’ouverture.', en: 'The c8 bishop comes out (Bf5 or Bg4) before ...e6: that is the whole point of the opening.' },
      {
        fr: 'Contre l’avance (3.e5) : ...Bf5, ...e6 puis ...c5 pour attaquer la chaîne de pions blancs à sa base.',
        en: 'Against the Advance (3.e5): ...Bf5, ...e6 then ...c5 to hit White’s pawn chain at its base.',
      },
      {
        fr: 'Position solide mais un peu passive : les Noirs égalisent d’abord, puis jouent sur les faiblesses blanches, souvent en finale.',
        en: 'A solid but slightly passive position: Black equalises first, then plays on White’s weaknesses, often in the endgame.',
      },
      {
        fr: 'Piège à connaître : dans la variante 4...Nd7, 5.Qe2 Ngf6?? permet 6.Nd6 mat, car le pion e7 est cloué.',
        en: 'Trap to know: in the 4...Nd7 line, 5.Qe2 Ngf6?? allows 6.Nd6 mate, because the e7 pawn is pinned.',
      },
    ],
    lines: [
      {
        name: { fr: 'Variante classique (4...Bf5)', en: 'Classical Variation (4...Bf5)' },
        moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6',
        notes: {
          4: { fr: 'Le pion d5 attaque e4, soutenu par c6.', en: 'The d5 pawn attacks e4, supported by c6.' },
          8: { fr: 'Le fou sort avant ...e6.', en: 'The bishop comes out before ...e6.' },
          12: { fr: 'Une case de retraite : sinon h5 attraperait le fou.', en: 'A retreat square: otherwise h5 would trap the bishop.' },
          18: { fr: 'On échange le fou : l’attaque blanche perd de sa force.', en: 'Trade the bishop: White’s attack loses its bite.' },
          20: { fr: 'Structure saine : ...Ngf6, ...Be7 ou ...Bd6, puis roque.', en: 'A sound structure: ...Ngf6, ...Be7 or ...Bd6, then castle.' },
        },
      },
      {
        name: { fr: 'Variante d’avance (3.e5)', en: 'Advance Variation (3.e5)' },
        moves: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 cxd4 Nxd4 Ne7',
        notes: {
          5: { fr: 'Les Blancs prennent de l’espace.', en: 'White grabs space.' },
          6: { fr: 'Le fou sort avant ...e6, comme toujours.', en: 'The bishop comes out before ...e6, as always.' },
          8: { fr: 'La chaîne c6-d5-e6 bloque le centre.', en: 'The c6-d5-e6 chain blocks the centre.' },
          10: { fr: 'On attaque la chaîne blanche à sa base, d4.', en: 'Hit White’s chain at its base, d4.' },
          14: { fr: 'Le cavalier ira en c6 ou g6, et le fou f5 reste bien protégé par e6.', en: 'The knight heads for c6 or g6, and the f5 bishop stays protected by e6.' },
        },
      },
      {
        name: { fr: 'Variante d’échange (3.exd5)', en: 'Exchange Variation (3.exd5)' },
        moves: 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7',
        notes: {
          6: { fr: 'Structure symétrique, aucun pion faible.', en: 'A symmetrical structure, no weak pawns.' },
          8: { fr: 'Pression sur d4.', en: 'Pressure on d4.' },
          12: { fr: 'Le fou sort avant ...e6.', en: 'The bishop comes out before ...e6.' },
          14: {
            fr: 'Protège b7. Plan : ...e6, ...Bd6, roque puis ...b5-b4 (attaque de minorité).',
            en: 'Protects b7. Plan: ...e6, ...Bd6, castle, then ...b5-b4 (minority attack).',
          },
        },
      },
      {
        name: { fr: 'Attaque Panov (4.c4)', en: 'Panov Attack (4.c4)' },
        moves: 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5 Bd3 Nc6 O-O O-O',
        notes: {
          7: { fr: 'Les Blancs acceptent un pion isolé en d4 contre du jeu actif.', en: 'White accepts an isolated d4 pawn for active play.' },
          14: { fr: 'Un cavalier en d5 bloque le pion isolé : la case idéale.', en: 'A knight on d5 blockades the isolated pawn: the ideal square.' },
          18: { fr: 'Plan : pression sur d4, échanges de pièces, et la finale est souvent bonne pour les Noirs.', en: 'Plan: pressure on d4, trade pieces, and the endgame often favours Black.' },
        },
      },
      {
        name: { fr: 'Piège : le mat du cavalier en d6', en: 'Trap: the knight mate on d6' },
        trap: true,
        moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#',
        notes: {
          9: { fr: 'La dame cloue le pion e7 sur le roi.', en: 'The queen pins the e7 pawn to the king.' },
          10: { fr: 'L’erreur : il fallait jouer ...Ndf6.', en: 'The mistake: ...Ndf6 was the move.' },
          11: { fr: 'Mat : le pion e7 ne peut pas prendre, il est cloué.', en: 'Mate: the e7 pawn cannot take, it is pinned.' },
        },
      },
    ],
    lichess: 'Caro-Kann_Defense',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/D%C3%A9fense_Caro-Kann', en: 'https://en.wikipedia.org/wiki/Caro%E2%80%93Kann_Defence' },
  },
  {
    slug: 'scandinavian',
    color: 'black',
    name: { fr: 'Défense scandinave', en: 'Scandinavian Defence' },
    eco: 'B01',
    moves: 'e4 d5',
    difficulty: 1,
    tagline: {
      fr: 'Les Noirs imposent leur jeu dès le premier coup.',
      en: 'Black sets the agenda from the very first move.',
    },
    summary: {
      fr: 'Avec 1...d5, les Noirs attaquent e4 tout de suite. Après 2.exd5 Qxd5, la dame sort tôt et perd un temps, mais les Noirs obtiennent une position simple et solide, avec peu de théorie et presque toujours la même structure. Très pratique en blitz.',
      en: 'With 1...d5, Black attacks e4 at once. After 2.exd5 Qxd5, the queen comes out early and loses a tempo, but Black gets a simple and solid position, with little theory and almost always the same structure. Very practical in blitz.',
    },
    ideas: [
      { fr: '1...d5 force les Blancs à jouer la partie des Noirs dès le premier coup.', en: '1...d5 makes White play Black’s game from move one.' },
      { fr: 'Après 3.Nc3, la dame se replie en a5 ou d6 : elle a perdu un temps mais reste active.', en: 'After 3.Nc3, the queen retreats to a5 or d6: it has lost a tempo but stays active.' },
      {
        fr: 'Développement type : ...Nf6, ...c6, ...Bf5 (ou ...Bg4), ...e6. Une structure de Caro-Kann, avec la dame déjà sortie.',
        en: 'Typical development: ...Nf6, ...c6, ...Bf5 (or ...Bg4), ...e6. A Caro-Kann structure, with the queen already out.',
      },
      { fr: 'Le fou c8 sort avant ...e6, comme dans la Caro-Kann.', en: 'The c8 bishop comes out before ...e6, as in the Caro-Kann.' },
      {
        fr: 'La dame est une cible : surveiller les coups qui l’attaquent en gagnant du temps (Bd2 avec Nd5, Nb5, b4).',
        en: 'The queen is a target: watch the moves that attack it while gaining time (Bd2 with Nd5, Nb5, b4).',
      },
    ],
    lines: [
      {
        name: { fr: 'Ligne principale : 3...Qa5', en: 'Main line: 3...Qa5' },
        moves: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6',
        notes: {
          2: { fr: 'Attaque e4 tout de suite.', en: 'Attacks e4 at once.' },
          5: { fr: 'Le cavalier chasse la dame en se développant.', en: 'The knight chases the queen while developing.' },
          6: { fr: 'La dame se met à l’abri sur le côté et cloue le cavalier c3.', en: 'The queen steps aside and pins the c3 knight.' },
          10: { fr: 'Une case de retraite en c7 pour la dame, et d5 sous contrôle.', en: 'A retreat square on c7 for the queen, and d5 under control.' },
          13: { fr: 'Attention : Nd5 découvrirait une attaque du fou d2 sur la dame a5.', en: 'Careful: Nd5 would uncover an attack by the d2 bishop on the a5 queen.' },
          14: { fr: 'Structure solide : ...Bb4 ou ...Be7, ...Nbd7, roque.', en: 'A solid structure: ...Bb4 or ...Be7, ...Nbd7, castle.' },
        },
      },
      {
        name: { fr: 'Variante moderne : 3...Qd6', en: 'Modern line: 3...Qd6' },
        moves: 'e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 c6 Bc4 Bf5 O-O e6',
        notes: {
          6: { fr: 'La dame reste centrale et à l’abri des pièges du type Bd2 et Nd5.', en: 'The queen stays central and safe from tricks like Bd2 and Nd5.' },
          10: { fr: 'Contrôle b5 et d5, et prépare une retraite en c7.', en: 'Controls b5 and d5, and prepares a retreat to c7.' },
          12: { fr: 'Le fou sort avant ...e6.', en: 'The bishop comes out before ...e6.' },
          14: { fr: 'Plan : ...Nbd7, ...Be7, roque, comme dans la ligne 3...Qa5.', en: 'Plan: ...Nbd7, ...Be7, castle, as in the 3...Qa5 line.' },
        },
      },
      {
        name: { fr: 'Scandinave avec 2...Nf6', en: 'Scandinavian with 2...Nf6' },
        moves: 'e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 c4 Nb6 Nc3 Bg7',
        notes: {
          4: { fr: 'On reprend le pion avec le cavalier : pas de temps perdu avec la dame.', en: 'Win the pawn back with the knight: no time lost with the queen.' },
          6: { fr: 'Pion récupéré, le cavalier est bien centralisé.', en: 'Pawn regained, and the knight is well centralised.' },
          9: { fr: 'Les Blancs chassent le cavalier avec un grand centre.', en: 'White chases the knight with a big centre.' },
          12: { fr: 'Le fou g7 met la pression sur le centre blanc (d4).', en: 'The g7 bishop puts pressure on White’s centre (d4).' },
        },
      },
    ],
    lichess: 'Scandinavian_Defense',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/D%C3%A9fense_scandinave', en: 'https://en.wikipedia.org/wiki/Scandinavian_Defense' },
  },
  {
    slug: 'sicilian',
    color: 'black',
    name: { fr: 'Défense sicilienne', en: 'Sicilian Defence' },
    eco: 'B20 – B99',
    moves: 'e4 c5',
    difficulty: 3,
    tagline: {
      fr: 'La réponse la plus jouée à 1.e4 : on joue pour gagner, des deux côtés.',
      en: 'The most played answer to 1.e4: both sides play to win.',
    },
    summary: {
      fr: 'Avec 1...c5, les Noirs ne copient pas 1...e5 : ils contestent la case d4 avec un pion de côté. Les positions sont déséquilibrées et tranchantes. C’est la réponse la plus jouée contre 1.e4, à tous les niveaux, mais elle demande plus de théorie que la Caro-Kann ou la Scandinave.',
      en: 'With 1...c5, Black does not copy 1...e5: they fight for d4 with a side pawn. The positions are unbalanced and sharp. It is the most played answer to 1.e4 at every level, but it needs more theory than the Caro-Kann or the Scandinavian.',
    },
    ideas: [
      {
        fr: '...c5 contrôle d4. Si les Blancs ouvrent le jeu avec d4, les Noirs échangent un pion de côté contre un pion central : ils gardent deux pions centraux contre un.',
        en: '...c5 controls d4. If White opens with d4, Black trades a side pawn for a central one: they keep two central pawns against one.',
      },
      {
        fr: 'Les Blancs ont plus d’espace et attaquent souvent l’aile roi ; les Noirs contre-attaquent sur l’aile dame, par la colonne c semi-ouverte.',
        en: 'White has more space and often attacks on the kingside; Black counter-attacks on the queenside, down the half-open c-file.',
      },
      { fr: 'Najdorf (5...a6) : un coup souple qui contrôle b5 et prépare ...e5 ou ...b5.', en: 'Najdorf (5...a6): a flexible move that controls b5 and prepares ...e5 or ...b5.' },
      { fr: 'Dragon (5...g6) : le fou g7 sur la grande diagonale, très fort contre l’aile dame blanche.', en: 'Dragon (5...g6): the g7 bishop on the long diagonal, very strong against White’s queenside.' },
      {
        fr: 'Contre les anti-siciliennes (2.c3, gambit Smith-Morra), le schéma ...Nf6 puis ...Nd5 évite beaucoup de théorie.',
        en: 'Against the anti-Sicilians (2.c3, Smith-Morra Gambit), the ...Nf6 then ...Nd5 setup avoids a lot of theory.',
      },
    ],
    lines: [
      {
        name: { fr: 'Najdorf, contre l’attaque anglaise', en: 'Najdorf, against the English Attack' },
        moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7',
        notes: {
          2: { fr: 'Contrôle d4 avec un pion de côté.', en: 'Controls d4 with a side pawn.' },
          6: { fr: 'Pion de côté contre pion central.', en: 'A side pawn for a central pawn.' },
          10: { fr: 'Le coup de Najdorf : contrôle b5, prépare ...e5 et ...b5.', en: 'Najdorf’s move: controls b5, prepares ...e5 and ...b5.' },
          12: { fr: 'Chasse le cavalier et prend sa part du centre.', en: 'Chases the knight and takes a share of the centre.' },
          15: { fr: 'Les Blancs préparent g4 et une attaque de pions sur l’aile roi.', en: 'White prepares g4 and a pawn storm on the kingside.' },
          19: { fr: 'Roques opposés : la course à l’attaque commence.', en: 'Opposite-side castling: the attacking race begins.' },
          20: { fr: 'Plan noir : ...b5-b4 et la colonne c contre le roi blanc.', en: 'Black’s plan: ...b5-b4 and the c-file against White’s king.' },
        },
      },
      {
        name: { fr: 'Contre l’Alapin (2.c3)', en: 'Against the Alapin (2.c3)' },
        moves: 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 cxd4 d6 Nf3 Nc6',
        notes: {
          3: { fr: 'Les Blancs préparent d4 pour reprendre avec un pion.', en: 'White prepares d4 to recapture with a pawn.' },
          4: { fr: 'Attaque e4 tout de suite.', en: 'Attacks e4 at once.' },
          6: { fr: 'Le cavalier est très bien en d5 : c3 lui a pris sa case naturelle.', en: 'The knight is very well placed on d5: c3 took away its natural square.' },
          10: { fr: 'On attaque le pion e5 avant que les Blancs ne le soutiennent.', en: 'Hit the e5 pawn before White can support it.' },
          12: { fr: 'Pression sur e5 et d4 : les Noirs sont bien.', en: 'Pressure on e5 and d4: Black is fine.' },
        },
      },
      {
        name: { fr: 'Contre le gambit Smith-Morra (refusé)', en: 'Against the Smith-Morra Gambit (declined)' },
        moves: 'e4 c5 d4 cxd4 c3 Nf6 e5 Nd5 cxd4 d6 Nf3 Nc6',
        notes: {
          5: { fr: 'Le gambit : un pion contre du développement.', en: 'The gambit: a pawn for development.' },
          6: { fr: 'Pas besoin de prendre : on attaque e4, comme contre l’Alapin.', en: 'No need to take: attack e4, as against the Alapin.' },
          9: { fr: 'Même position que contre l’Alapin : une seule chose à retenir.', en: 'The same position as against the Alapin: only one thing to remember.' },
        },
      },
    ],
    lichess: 'Sicilian_Defense',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/D%C3%A9fense_sicilienne', en: 'https://en.wikipedia.org/wiki/Sicilian_Defence' },
  },
];

export const openingBySlug = (slug: string | undefined) => OPENINGS.find((o) => o.slug === slug);
