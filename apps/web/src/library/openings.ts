/**
 * The openings of the library ("Bibliothèque"), written for the app: each move explained, in
 * PGN like a Lichess study. A comment is "[fr] … [en] …"; [%cal Gc1f4] draws an arrow (G green,
 * R red, Y yellow, B blue) and [%csl Gd4] a square. The first move of a list is the main line,
 * the others (in parentheses) are variations. Main lines checked against the Lichess opening
 * explorer, Wikipedia and 365chess; openings.test.ts replays every chapter.
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
      { fr: 'Le fou sort en f4 avant de jouer e3 : sinon il resterait enfermé derrière ses propres pions.', en: 'The bishop goes to f4 before e3: otherwise it would stay locked behind its own pawns.' },
      { fr: 'La pyramide de pions c3-d4-e3 donne un centre très solide, difficile à attaquer.', en: 'The c3-d4-e3 pawn pyramid makes a very solid centre, hard to attack.' },
      { fr: 'Le cavalier en e5 sert de base pour attaquer le roque noir, et le fou d3 vise h7.', en: 'A knight on e5 is the base for an attack on Black’s king, and the d3 bishop aims at h7.' },
      { fr: 'Attention à ...c5 suivi de ...Qb6 : la dame noire vise b2, qui n’est plus défendu depuis que le fou a quitté c1.', en: 'Watch out for ...c5 followed by ...Qb6: Black’s queen hits b2, no longer defended once the bishop has left c1.' },
    ],
    chapters: [
      {
        name: { fr: 'Le Londres pas à pas', en: 'The London step by step' },
        pgn: `[Orientation "white"]

{ [fr] Le Système de Londres : on construit toujours le même dispositif, et on comprend pourquoi chaque pièce va sur sa case. [en] The London System: always the same setup, and why each piece goes to its square. }
1. d4 { [%csl Gd4,Ge5,Gc5] [fr] On occupe le centre. Le pion d4 contrôle e5 et c5, et libère le fou c1. [en] Take the centre. The d4 pawn controls e5 and c5, and frees the c1 bishop. }
1... d5 { [%cal Gd5e4] [fr] Les Noirs prennent leur part du centre et empêchent e4. [en] Black takes a share of the centre and stops e4. }
(1... Nf6 { [fr] Les Noirs gardent le choix de leur structure. Pas de souci : on joue le même plan. [en] Black keeps their pawn structure open. No problem: same plan. }
2. Bf4 { [%cal Gc1f4] [fr] Toujours le fou d'abord. [en] The bishop first, as always. }
2... g6 { [%cal Gf8g7] [fr] Les Noirs préparent un fianchetto : le fou ira en g7. [en] Black prepares a fianchetto: the bishop goes to g7. }
3. e3 { [fr] On soutient d4. [en] Support d4. }
3... Bg7 4. Nf3 { [%csl Ge5] [fr] Développement et contrôle de e5. [en] Develop and control e5. }
4... O-O 5. Be2 { [%cal Rd3g6] [fr] Contre ...g6, le fou est mieux en e2 : en d3, il taperait dans le pion g6. [en] Against ...g6 the bishop is better on e2: on d3 it would bite on the g6 pawn. }
5... d6 6. h3 { [%cal Gf4h2] [fr] Une case de retraite en h2 pour le fou, et plus de ...Nh5 ni de ...Bg4 gênants. [en] A retreat square on h2 for the bishop, and no annoying ...Nh5 or ...Bg4. }
6... c5 7. c3 { [%csl Gc3,Gd4,Ge3] [fr] Toujours la même pyramide c3-d4-e3. [en] Always the same c3-d4-e3 pyramid. })
2. Bf4 { [%cal Gc1f4] [%csl Ge5] [fr] Le coup clé du Londres : le fou sort AVANT e3. Après e3, il serait enfermé derrière son pion. En f4, il surveille e5. [en] The key move of the London: the bishop comes out BEFORE e3. After e3 it would be locked behind its pawn. On f4 it watches e5. }
2... Nf6 { [%csl Ge4] [fr] Développement naturel : le cavalier contrôle e4. [en] Natural development: the knight controls e4. }
3. e3 { [%cal Gf1d3] [fr] Maintenant que le fou est dehors, e3 soutient d4 et ouvre la route du fou f1 vers d3. [en] Now that the bishop is out, e3 supports d4 and opens the way for the f1 bishop to d3. }
3... c5 { [%cal Gc5d4] [fr] La réaction la plus fréquente : les Noirs attaquent d4 avec un pion de côté. [en] The most common reaction: Black attacks d4 with a side pawn. }
(3... e6 { [fr] Plus calme : les Noirs ouvrent leur fou f8. [en] Quieter: Black opens their f8 bishop. }
4. Nf3 { [%csl Ge5] [fr] Contrôle e5. [en] Controls e5. }
4... Bd6 { [%cal Rd6f4] [fr] Les Noirs proposent l'échange de notre meilleur fou. [en] Black offers to trade our best bishop. }
5. Bg3 { [%cal Gf4g3,Gh1h5] [fr] On garde le fou. Si ...Bxg3 hxg3, la colonne h s'ouvre pour la tour. [en] Keep the bishop. If ...Bxg3 hxg3, the h-file opens for the rook. }
5... O-O 6. Bd3 { [%cal Gd3h7] [fr] Le fou vise h7, près du roi noir. [en] The bishop aims at h7, next to Black's king. }
6... c5 7. c3 { [%csl Gc3,Gd4,Ge3] [fr] La pyramide. [en] The pyramid. }
7... Nc6 8. Nbd2 { [fr] Le dispositif est complet. [en] The setup is complete. })
4. c3 { [%csl Gc3,Gd4,Ge3] [fr] La pyramide c3-d4-e3 : d4 est protégé deux fois et ne craint rien. Si ...cxd4, on reprend exd4. [en] The c3-d4-e3 pyramid: d4 is protected twice and is safe. If ...cxd4, recapture exd4. }
4... Nc6 { [%cal Gc6d4] [fr] Encore plus de pression sur d4. [en] Even more pressure on d4. }
(4... Qb6 { [%cal Rb6b2] [%csl Rb2] [fr] Le piège à connaître : la dame vise b2, qui n'est plus défendu depuis que le fou a quitté c1. [en] The trap to know: the queen hits b2, no longer defended since the bishop left c1. }
5. Qb3 { [%cal Gb3b2] [fr] La meilleure parade : b2 est défendu et on propose l'échange des dames. Si ...Qxb3, axb3 ouvre la colonne a pour la tour. [en] The best answer: b2 is defended and we offer a queen trade. If ...Qxb3, axb3 opens the a-file for the rook. }
5... Nc6 6. Nd2 { [fr] Développement normal. [en] Normal development. }
6... Bf5 7. Ngf3 { [fr] Le second cavalier contrôle e5. [en] The second knight controls e5. }
7... e6 { [fr] Position équilibrée, avec un plan simple pour les Blancs : Be2, roque, Ne5. [en] A balanced position, with a simple plan for White: Be2, castle, Ne5. })
5. Nd2 { [%cal Gb1d2,Gd2e4] [fr] Le cavalier va en d2, pas en c3 : c3 est la case du pion. Depuis d2, il soutient e4 et f3. [en] The knight goes to d2, not c3: c3 is for the pawn. From d2 it supports e4 and f3. }
5... e6 { [fr] Les Noirs ouvrent leur fou f8. Leur fou c8 reste enfermé : c'est le prix de leur structure. [en] Black opens their f8 bishop. Their c8 bishop stays locked in: the price of their structure. }
6. Ngf3 { [%cal Gg1f3] [%csl Ge5] [fr] Développement et contrôle de e5, la case clé du Londres. [en] Develop and control e5, the key square of the London. }
6... Bd6 { [%cal Rd6f4] [fr] Les Noirs proposent l'échange du fou f4. [en] Black offers to trade the f4 bishop. }
7. Bg3 { [%cal Gf4g3,Gh1h5] [fr] On garde le fou. Si ...Bxg3 hxg3, la colonne h s'ouvre et le pion g3 protège f4 et h4. [en] Keep the bishop. If ...Bxg3 hxg3, the h-file opens and the g3 pawn guards f4 and h4. }
7... O-O { [fr] Le roi noir est à l'abri. [en] Black's king is safe. }
8. Bd3 { [%cal Gd3h7] [fr] Dernière pièce mineure : le fou vise h7. Ensuite : roque, puis Ne5 et attaque sur l'aile roi, ou e4 pour ouvrir le centre. [en] The last minor piece: the bishop aims at h7. Next: castle, then Ne5 and a kingside attack, or e4 to open the centre. } *`,
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
      { fr: 'c3 prépare d4 pour construire un grand centre, et ouvre une retraite au fou en b3.', en: 'c3 prepares d4 to build a big centre, and opens a retreat on b3 for the bishop.' },
      { fr: 'Version lente : c3, d3, roque, Re1, puis le cavalier b1 voyage par d2 et f1 jusqu’en g3.', en: 'Slow version: c3, d3, castle, Re1, then the b1 knight travels via d2 and f1 to g3.' },
      { fr: 'Contre 3...Nf6, 4.Ng5 attaque f7 tout de suite, et 5...Nxd5? permet l’attaque Fried Liver.', en: 'Against 3...Nf6, 4.Ng5 attacks f7 at once, and 5...Nxd5? allows the Fried Liver Attack.' },
    ],
    chapters: [
      {
        name: { fr: 'L’Italienne pas à pas', en: 'The Italian step by step' },
        pgn: `[Orientation "white"]

{ [fr] La Partie italienne : se développer vite, roquer, et viser f7. [en] The Italian Game: develop fast, castle, and aim at f7. }
1. e4 { [%csl Gd5,Gf5] [fr] On occupe le centre et on ouvre la route de la dame et du fou f1. [en] Take the centre and open the way for the queen and the f1 bishop. }
1... e5 { [fr] Les Noirs prennent leur part du centre. [en] Black takes a share of the centre. }
2. Nf3 { [%cal Gf3e5] [fr] On se développe en attaquant e5 : les Noirs doivent répondre. [en] Develop while attacking e5: Black must respond. }
2... Nc6 { [%cal Gc6e5] [fr] Défend e5 en se développant. [en] Defends e5 while developing. }
3. Bc4 { [%cal Gc4f7] [%csl Rf7] [fr] Le fou vise f7, la case la plus faible du camp noir : seul le roi la défend. [en] The bishop aims at f7, the weakest square in Black's camp: only the king defends it. }
3... Bc5 { [%cal Gc5f2] [fr] Les Noirs font pareil : leur fou vise f2. C'est le Giuoco Piano. [en] Black does the same: their bishop aims at f2. This is the Giuoco Piano. }
(3... Nf6 { [%cal Gf6e4] [fr] La défense des deux cavaliers : contre-attaque sur e4. [en] The Two Knights Defence: counter-attack on e4. }
4. Ng5 { [%cal Gg5f7,Gc4f7] [fr] Le cavalier et le fou attaquent f7 ensemble. [en] Knight and bishop attack f7 together. }
4... d5 { [%cal Gd5c4] [fr] La seule bonne défense : couper la diagonale du fou. [en] The only good defence: cut the bishop's diagonal. }
5. exd5 { [fr] On prend : le pion d5 cloue presque le jeu noir. [en] Take: the d5 pawn cramps Black. }
5... Na5 { [%cal Ga5c4] [fr] Les Noirs chassent le fou. Surtout pas 5...Nxd5? (voir le chapitre « Piège »). [en] Black chases the bishop. Not 5...Nxd5? (see the Trap chapter). }
6. Bb5+ { [fr] Échec pour garder le fou actif. [en] Check, to keep the bishop active. }
6... c6 7. dxc6 { [fr] On prend : un pion de plus, pour l'instant. [en] Take: a pawn up, for now. }
7... bxc6 { [fr] Les Noirs ont donné un pion contre une avance de développement. [en] Black has given a pawn for a lead in development. }
8. Be2 { [fr] Le fou se replie en sécurité. [en] The bishop retreats to safety. }
8... h6 { [%cal Gh6g5] [fr] Chasse le cavalier. [en] Chases the knight. }
9. Nf3 { [fr] Le cavalier recule. [en] The knight retreats. }
9... e4 { [fr] Encore un temps gagné. [en] Another tempo gained. }
10. Ne5 { [%csl Ge5] [fr] Le cavalier s'installe en e5 : les Blancs gardent le pion de plus, les Noirs ont de l'activité. [en] The knight settles on e5: White keeps the extra pawn, Black has activity. })
4. c3 { [%cal Gc3d4] [fr] Prépare d4 pour un grand centre, et offre une retraite au fou en b3. [en] Prepares d4 for a big centre, and gives the bishop a retreat on b3. }
4... Nf6 { [%cal Gf6e4] [fr] Les Noirs attaquent e4. [en] Black attacks e4. }
5. d3 { [%csl Ge4] [fr] La version calme, le Giuoco Pianissimo : e4 est protégé, d4 viendra plus tard. Très jouée à haut niveau. [en] The quiet version, the Giuoco Pianissimo: e4 is protected, d4 will come later. Very popular at the top. }
(5. d4 { [%csl Gd4,Ge4] [fr] Le plan direct : le grand centre e4-d4. [en] The direct plan: the big e4-d4 centre. }
5... exd4 { [fr] Les Noirs doivent réagir tout de suite. [en] Black must react at once. }
6. cxd4 { [fr] Le centre idéal. [en] The ideal centre. }
6... Bb4+ { [fr] L'échec gagne un temps. [en] The check gains a tempo. }
7. Bd2 { [fr] On pare l'échec en proposant l'échange des fous. [en] Block the check by offering a bishop trade. }
7... Bxd2+ 8. Nbxd2 { [fr] On reprend avec le cavalier, qui protège e4. [en] Recapture with the knight, which protects e4. }
8... d5 { [%cal Gd5e4] [fr] Indispensable : les Noirs cassent le centre avant e5. [en] Essential: Black breaks the centre before e5. }
9. exd5 { [fr] On prend, plutôt que de laisser ...dxe4. [en] Take, rather than allow ...dxe4. }
9... Nxd5 10. Qb3 { [%cal Gb3d5,Gb3b7] [fr] La dame vise d5 et b7. [en] The queen hits d5 and b7. }
10... Nce7 11. O-O { [fr] Le roi à l'abri. [en] King to safety. }
11... O-O { [%csl Yd4] [fr] Les Blancs ont un pion isolé en d4 : de l'activité contre une faiblesse. [en] White has an isolated pawn on d4: activity in exchange for a weakness. })
5... d6 { [fr] Les Noirs soutiennent e5 et ouvrent leur fou c8. [en] Black supports e5 and opens their c8 bishop. }
6. O-O { [fr] Le roi à l'abri avant d'ouvrir le jeu. [en] King safety before opening the game. }
6... O-O 7. Re1 { [%cal Ge1e4] [fr] La tour soutient e4 et libère f1 pour le cavalier. [en] The rook supports e4 and frees f1 for the knight. }
7... a6 { [%cal Gc5a7] [fr] Les Noirs préparent une retraite en a7 pour leur fou, à l'abri de d4 et b4. [en] Black prepares a retreat on a7 for their bishop, safe from d4 and b4. }
8. Bb3 { [fr] Le fou recule avant d'être chassé par ...b5 ou ...Na5. [en] The bishop steps back before ...b5 or ...Na5 chases it. }
8... Ba7 9. Nbd2 { [%cal Gd2f1,Gf1g3] [fr] La manœuvre typique : le cavalier ira en f1 puis g3, vers le roque noir. [en] The typical manoeuvre: the knight heads for f1 then g3, towards Black's king. } *`,
      },
      {
        name: { fr: 'Piège : l’attaque Fried Liver', en: 'Trap: the Fried Liver Attack' },
        trap: true,
        pgn: `[Orientation "white"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 { [%cal Gg5f7,Gc4f7] [fr] Double attaque sur f7. [en] Double attack on f7. }
4... d5 5. exd5 Nxd5 { [%csl Rd5] [fr] L'erreur classique : le cavalier d5 devient une cible. [en] The classic mistake: the d5 knight becomes a target. }
6. Nxf7 { [%cal Gg5f7] [fr] Sacrifice du cavalier pour attirer le roi au centre. [en] Knight sacrifice to drag the king into the centre. }
6... Kxf7 7. Qf3+ { [%cal Gf3f7,Gf3d5] [fr] Échec, et le cavalier d5 est attaqué deux fois. [en] Check, and the d5 knight is attacked twice. }
7... Ke6 { [fr] Le seul coup pour garder le cavalier. [en] The only move to keep the knight. }
8. Nc3 { [%cal Gc3d5] [fr] Encore une pièce sur d5 : le roi noir restera exposé longtemps. [en] One more piece on d5: Black's king will stay exposed for a long time. } *`,
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
      fr: 'Avec 1.d4 d5 2.c4, les Blancs offrent le pion c4 pour détourner le pion d5 du centre. Ce n’est pas vraiment un gambit : si les Noirs veulent garder le pion, ils le paient cher. Une des ouvertures les plus solides de l’histoire des échecs.',
      en: 'With 1.d4 d5 2.c4, White offers the c4 pawn to lure the d5 pawn away from the centre. It is not really a gambit: if Black tries to keep the pawn, it costs them dearly. One of the most solid openings in chess history.',
    },
    ideas: [
      { fr: 'c4 attaque d5 : si les Noirs prennent, e4 permet de prendre tout le centre.', en: 'c4 attacks d5: if Black takes, e4 grabs the whole centre.' },
      { fr: 'Après 2...dxc4, pas besoin de courir après le pion : e3 puis Bxc4 le récupèrent.', en: 'After 2...dxc4, no need to chase the pawn: e3 then Bxc4 win it back.' },
      { fr: 'Contre 2...e6, développement classique Nc3, Bg5, e3, Nf3 et pression sur d5.', en: 'Against 2...e6, classical development Nc3, Bg5, e3, Nf3 and pressure on d5.' },
      { fr: 'Piège de l’éléphant : prendre d5 avec le cavalier quand il semble cloué peut coûter une pièce.', en: 'The Elephant Trap: taking d5 with the knight when it looks pinned can lose a piece.' },
    ],
    chapters: [
      {
        name: { fr: 'Le Gambit dame pas à pas', en: 'The Queen’s Gambit step by step' },
        pgn: `[Orientation "white"]

{ [fr] Le Gambit dame : attaquer le centre noir avec un pion de côté. [en] The Queen's Gambit: attack Black's centre with a side pawn. }
1. d4 { [%csl Gd4] [fr] On occupe le centre et on libère le fou c1. [en] Take the centre and free the c1 bishop. }
1... d5 { [fr] Les Noirs bloquent le pion d4. [en] Black blocks the d4 pawn. }
2. c4 { [%cal Gc4d5] [fr] Le gambit : on attaque d5 avec un pion de côté. Si les Noirs prennent, ils abandonnent le centre. [en] The gambit: attack d5 with a side pawn. If Black takes, they give up the centre. }
2... e6 { [%cal Ge6d5] [%csl Rc8] [fr] Le gambit refusé : d5 est tenu par un pion. Solide, mais le fou c8 est enfermé. [en] The Declined: d5 is held by a pawn. Solid, but the c8 bishop is locked in. }
(2... dxc4 { [fr] Le gambit accepté : les Noirs ne gardent pas le pion, ils libèrent leur jeu. [en] The Accepted: Black won't keep the pawn, they free their game. }
3. Nf3 { [%cal Rd8d1] [%csl Ge5] [fr] Pas 3.e4 tout de suite : on empêche ...e5 et on se développe. [en] Not 3.e4 at once: stop ...e5 and develop. }
3... Nf6 4. e3 { [%cal Gf1c4] [fr] Ouvre la diagonale du fou vers c4 : le pion va tomber. [en] Opens the bishop's diagonal to c4: the pawn will fall. }
4... e6 5. Bxc4 { [fr] Pion récupéré, et un beau centre. [en] Pawn regained, and a fine centre. }
5... c5 { [%cal Gc5d4] [fr] Les Noirs attaquent d4 à leur tour. [en] Black attacks d4 in turn. }
6. O-O { [fr] Roque avant d'ouvrir le centre. [en] Castle before opening the centre. }
6... a6 { [fr] Prépare ...b5 pour chasser le fou. [en] Prepares ...b5 to chase the bishop. })
(2... c6 { [%cal Gc6d5] [fr] La défense slave : d5 tenu sans enfermer le fou c8. [en] The Slav: d5 held without locking in the c8 bishop. }
3. Nf3 { [fr] Développement simple. [en] Simple development. }
3... Nf6 4. Nc3 { [fr] Encore une pièce contre d5. [en] One more piece against d5. }
4... dxc4 { [fr] Les Noirs prennent quand même, prêts à défendre le pion par ...b5. [en] Black takes anyway, ready to defend the pawn with ...b5. }
5. a4 { [%cal Ga4b5] [fr] Empêche ...b5 : le pion c4 tombera. [en] Stops ...b5: the c4 pawn will fall. }
5... Bf5 6. e3 { [fr] Ouvre le fou f1 vers c4. [en] Opens the f1 bishop towards c4. }
6... e6 7. Bxc4 { [fr] Le fou reprend le pion. [en] The bishop wins the pawn back. }
7... Bb4 8. O-O { [fr] Pion récupéré, développement simple. [en] Pawn regained, simple development. })
3. Nc3 { [%cal Gc3d5] [fr] Une pièce de plus contre d5. [en] One more piece against d5. }
3... Nf6 { [%csl Gd5] [fr] Les Noirs défendent d5. [en] Black defends d5. }
4. Bg5 { [%cal Gg5f6,Gf6d5] [fr] Cloue le cavalier qui défend d5. [en] Pins the knight that defends d5. }
4... Be7 { [fr] Défait le clouage. [en] Breaks the pin. }
5. e3 { [%cal Gf1d3] [fr] Soutient d4 et ouvre le fou f1. [en] Supports d4 and opens the f1 bishop. }
5... O-O 6. Nf3 { [fr] Développement. [en] Development. }
6... Nbd7 { [fr] Le cavalier va en d7 pour soutenir ...c5 ou ...e5 plus tard. [en] The knight goes to d7 to support ...c5 or ...e5 later. }
7. Rc1 { [%cal Gc1c8] [fr] La tour se place sur la colonne c, qui va s'ouvrir. [en] The rook goes to the c-file, which is about to open. }
7... c6 { [fr] Consolide d5. [en] Shores up d5. }
8. Bd3 { [fr] Le fou se développe. Les Noirs vont prendre c4 et gagner un temps, mais ...dxc4 rend aussi le centre aux Blancs. [en] The bishop develops. Black will take on c4 and gain a tempo, but ...dxc4 also gives White the centre. }
8... dxc4 { [fr] Les Noirs gagnent un temps : le fou doit reprendre. [en] Black gains a tempo: the bishop must recapture. }
9. Bxc4 { [fr] Le fou est actif en c4. [en] The bishop is active on c4. }
9... Nd5 { [%cal Gd5g5] [fr] La manœuvre de libération de Capablanca : les Noirs échangent des pièces pour respirer. [en] Capablanca's freeing manoeuvre: Black trades pieces to get some air. } *`,
      },
      {
        name: { fr: 'Piège de l’éléphant', en: 'The Elephant Trap' },
        trap: true,
        pgn: `[Orientation "white"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 { [%cal Rg5f6] [fr] Le cavalier f6 semble cloué : il ne l'est pas vraiment. [en] The f6 knight looks pinned: it is not really. }
5. cxd5 exd5 6. Nxd5 { [%csl Rd5] [fr] L'erreur : le pion d5 a l'air gratuit. Il fallait jouer 6.e3. [en] The mistake: the d5 pawn looks free. 6.e3 was the move. }
6... Nxd5 { [fr] Les Noirs abandonnent leur dame ! [en] Black gives up their queen! }
7. Bxd8 Bb4+ { [%cal Gb4e1] [fr] L'échec qui récupère la dame. [en] The check that wins the queen back. }
8. Qd2 Bxd2+ 9. Kxd2 Kxd8 { [fr] Bilan : les Noirs ont une pièce de plus. [en] Result: Black is a piece up. } *`,
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
      { fr: 'Le fou c8 sort (Bf5 ou Bg4) avant ...e6 : c’est tout l’intérêt de l’ouverture.', en: 'The c8 bishop comes out (Bf5 or Bg4) before ...e6: that is the whole point.' },
      { fr: 'Contre l’avance (3.e5) : ...Bf5, ...e6 puis ...c5 contre la base de la chaîne.', en: 'Against the Advance (3.e5): ...Bf5, ...e6 then ...c5 against the base of the chain.' },
      { fr: 'Piège à connaître : dans la variante 4...Nd7, 5.Qe2 Ngf6?? permet 6.Nd6 mat.', en: 'Trap to know: in the 4...Nd7 line, 5.Qe2 Ngf6?? allows 6.Nd6 mate.' },
    ],
    chapters: [
      {
        name: { fr: 'La Caro-Kann pas à pas', en: 'The Caro-Kann step by step' },
        pgn: `[Orientation "black"]

{ [fr] La Caro-Kann : contester le centre sans enfermer son fou c8. [en] The Caro-Kann: challenge the centre without locking in the c8 bishop. }
1. e4 c6 { [%cal Gc6d5] [fr] Prépare ...d5 : le pion d5 sera soutenu par c6, et le fou c8 reste libre (contrairement à 1...e6). [en] Prepares ...d5: the d5 pawn will be supported by c6, and the c8 bishop stays free (unlike 1...e6). }
2. d4 { [fr] Les Blancs prennent tout le centre. [en] White takes the whole centre. }
2... d5 { [%cal Gd5e4] [fr] On attaque e4 tout de suite. [en] Attack e4 at once. }
3. Nc3 { [%cal Gc3e4] [fr] Les Blancs défendent e4 avec une pièce. [en] White defends e4 with a piece. }
(3. e5 { [%csl Ye5] [fr] La variante d'avance : les Blancs prennent de l'espace. [en] The Advance: White grabs space. }
3... Bf5 { [%cal Gc8f5] [fr] Le fou sort avant ...e6, comme toujours. [en] The bishop comes out before ...e6, as always. }
4. Nf3 e6 { [%csl Gc6,Gd5,Ge6] [fr] La chaîne c6-d5-e6 bloque le centre, et le fou f5 est dehors. [en] The c6-d5-e6 chain blocks the centre, and the f5 bishop is outside it. }
5. Be2 c5 { [%cal Gc5d4] [fr] On attaque la chaîne blanche à sa base, d4. [en] Hit White's chain at its base, d4. }
6. Be3 cxd4 { [fr] On ouvre la colonne c. [en] Open the c-file. }
7. Nxd4 Ne7 { [%cal Ge7c6,Ge7g6] [fr] Le cavalier ira en c6 ou g6 ; le fou f5 est protégé par e6. [en] The knight heads for c6 or g6; the f5 bishop is protected by e6. })
(3. exd5 { [fr] La variante d'échange. [en] The Exchange. }
3... cxd5 { [fr] Structure symétrique, aucun pion faible. [en] A symmetrical structure, no weak pawns. }
4. Bd3 (4. c4 { [%csl Yd4] [fr] L'attaque Panov : les Blancs acceptent un pion isolé contre du jeu actif. [en] The Panov Attack: White accepts an isolated pawn for active play. }
4... Nf6 { [fr] Pression sur d5. [en] Pressure on d5. }
5. Nc3 e6 { [fr] On soutient d5 et on ouvre le fou f8. [en] Support d5 and open the f8 bishop. }
6. Nf3 Be7 { [fr] Prépare le roque. [en] Prepares castling. }
7. cxd5 Nxd5 { [%csl Gd5] [fr] Le cavalier bloque le pion isolé : la case idéale. [en] The knight blockades the isolated pawn: the ideal square. }
8. Bd3 Nc6 { [%cal Gc6d4] [fr] Pression sur le pion isolé. [en] Pressure on the isolated pawn. }
9. O-O O-O { [fr] Plan : pression sur d4, échanges, et la finale est souvent bonne pour les Noirs. [en] Plan: pressure on d4, trades, and the endgame often favours Black. })
4... Nc6 { [%cal Gc6d4] [fr] Pression sur d4. [en] Pressure on d4. }
5. c3 Nf6 { [fr] Développement et contrôle de e4. [en] Development and control of e4. }
6. Bf4 Bg4 { [%cal Gc8g4] [fr] Le fou sort avant ...e6. [en] The bishop comes out before ...e6. }
7. Qb3 Qd7 { [%cal Gd7b7] [fr] Protège b7. Plan : ...e6, ...Bd6, roque puis ...b5-b4. [en] Protects b7. Plan: ...e6, ...Bd6, castle, then ...b5-b4. })
3... dxe4 { [fr] On échange en e4 : le fou c8 pourra sortir avec gain de temps. [en] Trade on e4: the c8 bishop can come out with tempo. }
4. Nxe4 Bf5 { [%cal Gf5e4] [fr] Le fou sort en attaquant le cavalier. [en] The bishop comes out attacking the knight. }
5. Ng3 { [%cal Gg3f5] [fr] Le cavalier recule en attaquant le fou. [en] The knight retreats, attacking the bishop. }
5... Bg6 { [fr] Le fou reste sur la diagonale. [en] The bishop stays on the diagonal. }
6. h4 { [%cal Gh4h5] [fr] Menace h5 pour attraper le fou. [en] Threatens h5 to trap the bishop. }
6... h6 { [%cal Gg6h7] [fr] Une case de retraite en h7 pour le fou. [en] A retreat square on h7 for the bishop. }
7. Nf3 Nd7 { [%cal Rf3e5] [fr] Contrôle e5 : le cavalier f3 ne pourra pas s'y installer. [en] Controls e5: the f3 knight can't settle there. }
8. h5 Bh7 { [fr] Le fou est en sécurité grâce à ...h6. [en] The bishop is safe thanks to ...h6. }
9. Bd3 { [%cal Gd3h7] [fr] Les Blancs proposent l'échange. [en] White offers the trade. }
9... Bxd3 { [fr] On échange : l'attaque blanche perd de sa force. [en] Trade: White's attack loses its bite. }
10. Qxd3 e6 { [%csl Gc6,Ge6] [fr] Structure saine : ...Ngf6, ...Be7 ou ...Bd6, puis roque. [en] A sound structure: ...Ngf6, ...Be7 or ...Bd6, then castle. } *`,
      },
      {
        name: { fr: 'Piège : le mat du cavalier en d6', en: 'Trap: the knight mate on d6' },
        trap: true,
        pgn: `[Orientation "black"]

1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Qe2 { [%cal Ge2e8] [fr] La dame cloue le pion e7 sur le roi. [en] The queen pins the e7 pawn to the king. }
5... Ngf6 { [%csl Rd6] [fr] L'erreur : il fallait jouer 5...Ndf6. [en] The mistake: 5...Ndf6 was the move. }
6. Nd6# { [%cal Gd6e8,Re2e7] [fr] Mat : le pion e7 ne peut pas prendre, il est cloué. [en] Mate: the e7 pawn cannot take, it is pinned. } *`,
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
    tagline: { fr: 'Les Noirs imposent leur jeu dès le premier coup.', en: 'Black sets the agenda from the very first move.' },
    summary: {
      fr: 'Avec 1...d5, les Noirs attaquent e4 tout de suite. Après 2.exd5 Qxd5, la dame sort tôt et perd un temps, mais les Noirs obtiennent une position simple et solide, avec peu de théorie et presque toujours la même structure. Très pratique en blitz.',
      en: 'With 1...d5, Black attacks e4 at once. After 2.exd5 Qxd5, the queen comes out early and loses a tempo, but Black gets a simple and solid position, with little theory and almost always the same structure. Very practical in blitz.',
    },
    ideas: [
      { fr: '1...d5 force les Blancs à jouer la partie des Noirs dès le premier coup.', en: '1...d5 makes White play Black’s game from move one.' },
      { fr: 'Après 3.Nc3, la dame se replie en a5 ou d6 : elle a perdu un temps mais reste active.', en: 'After 3.Nc3, the queen retreats to a5 or d6: it has lost a tempo but stays active.' },
      { fr: 'Développement type : ...Nf6, ...c6, ...Bf5, ...e6, une structure de Caro-Kann.', en: 'Typical development: ...Nf6, ...c6, ...Bf5, ...e6, a Caro-Kann structure.' },
      { fr: 'La dame est une cible : surveiller Bd2 avec Nd5, Nb5 et b4.', en: 'The queen is a target: watch out for Bd2 with Nd5, Nb5 and b4.' },
    ],
    chapters: [
      {
        name: { fr: 'La Scandinave pas à pas (3...Qa5)', en: 'The Scandinavian step by step (3...Qa5)' },
        pgn: `[Orientation "black"]

1. e4 d5 { [%cal Gd5e4] [fr] On attaque e4 tout de suite : les Blancs doivent décider maintenant. [en] Attack e4 at once: White must decide now. }
2. exd5 { [fr] La réponse la plus jouée. [en] The most common answer. }
(2. e5 { [%csl Ye5] [fr] Les Blancs évitent l'échange et prennent de l'espace. [en] White avoids the trade and grabs space. }
2... Bf5 { [%cal Gc8f5] [fr] Comme dans la Caro-Kann : le fou sort avant ...e6. [en] As in the Caro-Kann: the bishop comes out before ...e6. }
3. d4 e6 { [fr] Structure solide, et ...c5 viendra contre d4. [en] A solid structure, and ...c5 will come against d4. })
(2. Nc3 { [fr] Les Blancs défendent e4 sans échanger. [en] White defends e4 without trading. }
2... d4 { [%cal Gd4c3] [fr] On chasse le cavalier en prenant de l'espace. [en] Chase the knight while gaining space. }
3. Nce2 e5 { [%csl Gd4,Ge5] [fr] Un centre solide pour les Noirs. [en] A solid centre for Black. })
2... Qxd5 { [fr] On reprend le pion avec la dame. [en] Win the pawn back with the queen. }
3. Nc3 { [%cal Gc3d5] [fr] Le cavalier chasse la dame en se développant : les Blancs gagnent un temps. [en] The knight chases the queen while developing: White gains a tempo. }
3... Qa5 { [%cal Ga5c3,Ga5e1] [fr] La dame se met sur le côté, à l'abri, et cloue le cavalier c3. [en] The queen steps aside to safety and pins the c3 knight. }
4. d4 { [fr] Les Blancs prennent le centre. [en] White takes the centre. }
4... Nf6 { [fr] Développement, et contrôle de e4 et d5. [en] Development, controlling e4 and d5. }
5. Nf3 c6 { [%cal Ga5c7] [fr] Une retraite en c7 pour la dame, et d5 sous contrôle. [en] A retreat to c7 for the queen, and d5 under control. }
6. Bc4 Bf5 { [%cal Gc8f5] [fr] Le fou sort avant ...e6. [en] The bishop comes out before ...e6. }
7. Bd2 { [%cal Rc3d5,Rd2a5] [fr] Attention : Nd5 découvrirait une attaque du fou d2 sur la dame a5. [en] Careful: Nd5 would uncover an attack by the d2 bishop on the a5 queen. }
7... e6 { [%csl Gd5] [fr] Contrôle d5 et ouvre le fou f8. Structure solide : ...Bb4, ...Nbd7, roque. [en] Controls d5 and opens the f8 bishop. A solid structure: ...Bb4, ...Nbd7, castle. } *`,
      },
      {
        name: { fr: 'Variante 3...Qd6', en: 'The 3...Qd6 line' },
        pgn: `[Orientation "black"]

1. e4 d5 { [fr] On attaque e4. [en] Attack e4. }
2. exd5 Qxd5 { [fr] On reprend avec la dame. [en] Recapture with the queen. }
3. Nc3 Qd6 { [%csl Gd6] [fr] La dame reste centrale et à l'abri des pièges du type Bd2 et Nd5. [en] The queen stays central and safe from tricks like Bd2 and Nd5. }
4. d4 Nf6 { [fr] Développement naturel. [en] Natural development. }
5. Nf3 c6 { [%cal Gd6c7] [fr] Contrôle b5 et d5, et prépare une retraite en c7. [en] Controls b5 and d5, and prepares a retreat to c7. }
6. Bc4 Bf5 { [fr] Le fou sort avant ...e6. [en] The bishop comes out before ...e6. }
7. O-O e6 { [fr] Même plan qu'avec 3...Qa5 : ...Nbd7, ...Be7, roque. [en] Same plan as with 3...Qa5: ...Nbd7, ...Be7, castle. } *`,
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
    tagline: { fr: 'La réponse la plus jouée à 1.e4 : on joue pour gagner, des deux côtés.', en: 'The most played answer to 1.e4: both sides play to win.' },
    summary: {
      fr: 'Avec 1...c5, les Noirs ne copient pas 1...e5 : ils contestent la case d4 avec un pion de côté. Les positions sont déséquilibrées et tranchantes. C’est la réponse la plus jouée contre 1.e4, mais elle demande plus de théorie que la Caro-Kann ou la Scandinave.',
      en: 'With 1...c5, Black does not copy 1...e5: they fight for d4 with a side pawn. The positions are unbalanced and sharp. It is the most played answer to 1.e4, but it needs more theory than the Caro-Kann or the Scandinavian.',
    },
    ideas: [
      { fr: 'Si les Blancs ouvrent avec d4, les Noirs échangent un pion de côté contre un pion central.', en: 'If White opens with d4, Black trades a side pawn for a central one.' },
      { fr: 'Les Blancs attaquent souvent l’aile roi, les Noirs contre-attaquent par la colonne c.', en: 'White often attacks on the kingside, Black counter-attacks down the c-file.' },
      { fr: 'Najdorf (5...a6) : un coup souple qui contrôle b5 et prépare ...e5 ou ...b5.', en: 'Najdorf (5...a6): a flexible move that controls b5 and prepares ...e5 or ...b5.' },
      { fr: 'Contre 2.c3 et le gambit Smith-Morra, le schéma ...Nf6 puis ...Nd5 évite la théorie.', en: 'Against 2.c3 and the Smith-Morra Gambit, the ...Nf6 then ...Nd5 setup avoids theory.' },
    ],
    chapters: [
      {
        name: { fr: 'La Najdorf pas à pas', en: 'The Najdorf step by step' },
        pgn: `[Orientation "black"]

1. e4 c5 { [%cal Gc5d4] [fr] Contrôle d4 avec un pion de côté : le jeu sera déséquilibré. [en] Controls d4 with a side pawn: the game will be unbalanced. }
2. Nf3 { [fr] Prépare d4. [en] Prepares d4. }
(2. c3 { [%cal Gc3d4] [fr] L'Alapin : les Blancs veulent reprendre en d4 avec un pion. [en] The Alapin: White wants to recapture on d4 with a pawn. }
2... Nf6 { [%cal Gf6e4] [fr] On attaque e4 tout de suite. [en] Attack e4 at once. }
3. e5 Nd5 { [%csl Gd5] [fr] Le cavalier est très bien en d5 : c3 a pris sa case naturelle au cavalier blanc. [en] The knight is great on d5: c3 took the white knight's natural square. }
4. d4 cxd4 { [fr] On échange avant que les Blancs ne renforcent d4. [en] Trade before White reinforces d4. }
5. cxd4 d6 { [%cal Gd6e5] [fr] On attaque e5 avant qu'il soit soutenu. [en] Hit e5 before it can be supported. }
6. Nf3 Nc6 { [%cal Gc6e5,Gc6d4] [fr] Pression sur e5 et d4 : les Noirs sont bien. [en] Pressure on e5 and d4: Black is fine. })
(2. d4 { [fr] Le gambit Smith-Morra se prépare. [en] The Smith-Morra Gambit is coming. }
2... cxd4 { [fr] On prend le pion offert. [en] Take the pawn on offer. }
3. c3 { [fr] Le gambit : un pion contre du développement. [en] The gambit: a pawn for development. }
3... Nf6 { [fr] Pas besoin de prendre : on attaque e4, comme contre l'Alapin. [en] No need to take: attack e4, as against the Alapin. }
4. e5 Nd5 { [fr] Le cavalier s'installe au centre. [en] The knight settles in the centre. }
5. cxd4 d6 { [fr] On attaque e5. [en] Hit e5. }
6. Nf3 Nc6 { [fr] La même position que contre l'Alapin : une seule chose à retenir. [en] The same position as against the Alapin: only one thing to remember. })
2... d6 { [%cal Gd6e5] [fr] Contrôle e5 et ouvre le fou c8. [en] Controls e5 and opens the c8 bishop. }
3. d4 cxd4 { [fr] On échange un pion de côté contre un pion central : deux pions centraux contre un. [en] Trade a side pawn for a central pawn: two central pawns against one. }
4. Nxd4 Nf6 { [%cal Gf6e4] [fr] Attaque e4 et force Nc3. [en] Attacks e4 and forces Nc3. }
5. Nc3 a6 { [%csl Gb5] [fr] Le coup de Najdorf : contrôle b5 (plus de Nb5 ni Bb5) et prépare ...e5 et ...b5. [en] Najdorf's move: controls b5 (no Nb5 or Bb5) and prepares ...e5 and ...b5. }
6. Be3 { [fr] L'attaque anglaise : Be3, f3, Qd2, grand roque et g4. [en] The English Attack: Be3, f3, Qd2, long castling and g4. }
(6. Bg5 { [%cal Gg5f6] [fr] La ligne principale classique, très tranchante. [en] The classical main line, very sharp. }
6... e6 { [fr] Solide : on soutient d5 et on ouvre le fou f8. [en] Solid: support d5 and open the f8 bishop. }
7. f4 Be7 { [fr] Défait le clouage ; les Noirs roquent ensuite. [en] Breaks the pin; Black castles next. })
6... e5 { [%cal Ge5d4] [fr] Chasse le cavalier et prend sa part du centre. [en] Chases the knight and takes a share of the centre. }
7. Nb3 Be6 { [%csl Gd5] [fr] Contrôle d5, la case clé de cette structure. [en] Controls d5, the key square of this structure. }
8. f3 { [%cal Gg2g4] [fr] Les Blancs préparent g4 et une attaque de pions sur l'aile roi. [en] White prepares g4 and a kingside pawn storm. }
8... Be7 { [fr] Développement : le roque est prêt. [en] Development: castling is ready. }
9. Qd2 O-O { [fr] Le roi noir est à l'abri, pour l'instant. [en] Black's king is safe, for now. }
10. O-O-O { [fr] Roques opposés : la course à l'attaque commence. [en] Opposite-side castling: the attacking race begins. }
10... Nbd7 { [%cal Gb7b5,Gb5b4] [fr] Plan noir : ...b5-b4 et la colonne c contre le roi blanc. [en] Black's plan: ...b5-b4 and the c-file against White's king. } *`,
      },
    ],
    lichess: 'Sicilian_Defense',
    wikipedia: { fr: 'https://fr.wikipedia.org/wiki/D%C3%A9fense_sicilienne', en: 'https://en.wikipedia.org/wiki/Sicilian_Defence' },
  },
];

export const openingBySlug = (slug: string | undefined) => OPENINGS.find((o) => o.slug === slug);
