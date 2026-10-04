# À TABLE !

Jeu de cartes familial sur les spécialités des régions de France, jouable au doigt sur téléphone.
Tu affrontes 1 à 3 ordinateurs. Le but : terminer le menu de ta région secrète (Entrée, Plat, Fromage, Dessert) et décrocher 3 Étoiles pour devenir **Chef 3 étoiles**.

- **Vite + React + TypeScript**, sans backend : tout tourne dans le navigateur.
- **Moteur de règles pur** dans `src/engine/` (aucune dépendance à l'UI), testé avec **Vitest**.
- **PWA** : installable sur l'écran d'accueil, jouable hors ligne.
- **Tutoriel** : une manche guidée contre « Mamie ».
- **Page `/sim`** : des parties IA contre IA pour vérifier l'équilibrage.

## Lancer en local

```bash
cd atable-src
npm install
npm run dev          # http://localhost:5173/atable/
npm test             # tests du moteur
npm run build        # build de production dans ../atable/ (à committer)
```

## Tester sur ton téléphone (réseau local)

1. Ordinateur et téléphone sur le **même Wi-Fi**.
2. Lance `npm run dev:host` (équivaut à `vite --host`).
3. Vite affiche une adresse « Network », par exemple `http://192.168.1.42:5173/atable/`. Ouvre-la sur le téléphone.

Pour tester la version compilée : `npm run build && npm run preview`, puis ouvre l'adresse « Network » suivie de `/atable/`.
Note : le service worker exige HTTPS. Il ne s'active donc qu'en production ou sur `localhost`.

## Déployer sur Vercel

Le jeu est servi par le portfolio, à l'adresse **`/atable`** (ex. `portfolio-math-o-g.vercel.app/atable`).
Le portfolio est un site statique sans étape de build : c'est donc la **version compilée** qui est committée.

- `atable-src/` : le code source (exclu de la mise en ligne par `.vercelignore`).
- `atable/` : le build, généré par `npm run build`.

Après chaque modification du jeu :

```bash
cd atable-src
npm test && npm run build
git add ../atable && git commit -m "Met à jour À TABLE !" && git push
```

Vercel redéploie automatiquement le portfolio. Le `vercel.json` à la racine redirige `/atable/sim` vers le jeu.

Pour déployer le jeu **seul** sur un projet Vercel : importe le dépôt, choisis `atable-src` comme « Root Directory »,
commande de build `npm run build`, dossier de sortie `../atable` (ou change `base` et `outDir` dans `vite.config.ts`
en `/` et `dist`).

## Modifier les cartes

- **Noms, régions, couleurs** : tout est dans `src/config/cards.ts`.
- **Illustrations** : dépose une image par carte dans `public/cards/`, nommée par l'identifiant de la carte
  (ex. `alsace-plat.png`, `region-savoie.png`, `baguette.png`, `back.png`). La liste complète est dans
  `public/cards/README.md` (régénérée par `npm run card-ids`). Une image absente est remplacée
  par la carte provisoire. Pense à changer `CACHE` dans `public/sw.js` pour que les téléphones déjà installés
  rechargent les nouvelles images.

## Simulation

- Dans le navigateur : `/atable/sim` (ou le lien en bas de l'accueil). Nombre de parties (1000 par défaut),
  niveau des IA (dont « mixte », niveaux répartis au hasard autour de la table), protection après dénonciation et coup de pouce à la donne.
- En ligne de commande : `npm run sim -- 1000 moyen` (parties, niveau, puis éventuellement les nombres de joueurs).

## Arborescence

```
src/config/   cartes, régions, couleurs, icônes (à modifier librement)
src/engine/   moteur pur : types, paquet et menus (deck.ts), règles (game.ts), IA (ai.ts), tests
src/sim/      simulation + diagnostic d'équilibrage, page /sim
src/ui/       écrans React, table, animations, tutoriel
public/       manifest PWA (chemins en /atable/), service worker, icônes, cards/ pour tes illustrations
scripts/      sim.ts (simulation CLI), card-ids.ts, icons.mjs (génère les PNG depuis icon.svg)
```

## Règles (version 4)

- **Toutes les régions** (12) sont en jeu : 48 plats + Baguette + Vaisselle + 8 cartes à effet = 58 cartes.
- **1 région secrète par joueur**, unique (12 cartes Région, une par région). La carte Région **compte comme un
  plat fixe de sa région** (`regionCourse` dans `src/config/cards.ts`, ex. Savoie = Tartiflette) : il reste
  **3 plats à trouver**. La vraie carte de ce plat ne sert à rien à son propriétaire : la donner est un **bluff**.
- **8 cartes en main, 2 cartes données par tour** : chacune passée au voisin ou mise au Marché.
- **Marché ouvert** : la dernière carte de la défausse est visible ; celui qui reçoit une carte du Marché choisit
  entre la pioche et cette carte.
- **Plat du jour** : une carte tirée en début de manche change une règle (fromages au Marché, sens inversé, pas de
  Baguette, 3 cartes par tour, pas de dénonciation, double étoile, commande libre…).
- **Passer la commande** : une fois par tour, on peut demander un plat précis (« Qui a le Reblochon ? ») ; chacun
  répond oui ou non.
- **Annonce face cachée** : on pose son menu face cachée, on peut **bluffer**. Dès la première annonce, c'est le
  **Dernier service** : les autres jouent un dernier tour (sans dénonciation), puis tout le monde révèle. Un
  bluffeur perd 1 étoile et prend la Vaisselle ; en cas d'égalité, les annonces tardives perdent, puis départage
  par la Vaisselle. **Gastronomique** (sans Baguette) › **Maison** (la Baguette remplace un plat manquant).
- **Vaisselle** : toujours dans une main, **face visible** de tous, jamais au Marché, jamais dans un menu. Seul son
  porteur peut dénoncer, en **montrant une carte de sa main** comme indice :
  - juste : l'accusé prend la Vaisselle (et donne une carte au hasard), change de région depuis la réserve et
    devient protégé 🛡️ pour la manche ; le dénonciateur est **récompensé** (il prend une carte de l'accusé) ;
  - fausse : l'accusateur garde la Vaisselle et ne peut pas dénoncer au tour suivant.
- **Cartes à effet** (2 de chaque), jouées à la place d'une des cartes données, puis pile spéciale :
  🔄 **Demi-tour** (inverse le sens), 🤝 **Troc** (échange de main avec le joueur choisi), 🦊 **Chapardeur**
  (prend une carte au hasard au joueur choisi et lui en donne une), 🚫 **Contrôle sanitaire** (le joueur choisi ne
  peut pas annoncer jusqu'à la fin du tour suivant).
- **Étoiles** : chaque manche gagnée rapporte ⭐ ; le premier à 3 étoiles devient **Chef 3 étoiles**.

Tous ces réglages sont dans `DEFAULT_RULES` (`src/engine/game.ts`). L'ancienne version « 2 menus » reste disponible
(`TWO_MENUS_RULES`) pour la simulation.

## Précisions techniques

- **Ordre des dénonciations** : en début de tour, l'ordinateur qui a la Vaisselle décide d'abord. Sinon, tu peux
  dénoncer (si tu as la Vaisselle) tant que tu n'as pas validé ta carte. Une dénonciation annule les choix déjà
  faits ce tour-ci (les mains ont changé).
- **Marché** : les cartes du Marché arrivent sur la défausse, puis les voisins piochent dans l'ordre des joueurs.
  Si la pioche se vide, la défausse est remélangée (y compris pendant l'échange).
- **Annonce** : simultanée, après l'échange. Le joueur humain peut aussi choisir « Attendre ».
- **Sécurité** : au-delà de 200 tours sans annonce, la manche s'arrête sans gagnant.
- Les régions et leur avancement sont cachés à l'écran tant que tu ne tapes pas sur « Mes régions ».

## IA

- **Facile** : passe au hasard une carte qui n'est pas de ses régions (parfois au Marché, sinon la pioche ne
  tournerait jamais), annonce dès qu'elle peut, ne dénonce jamais.
- **Moyen** : garde ses cartes de région, refile toujours la Vaisselle, lâche d'abord les cartes « en double »
  (même type de plat). Une carte inutile *pour elle et pour son voisin* part au Marché, sinon elle est passée.
  Avec la Baguette, elle tente parfois d'attendre le Gastronomique. Si la manche s'éternise (plus de 12 tours),
  elle renouvelle ses cartes au Marché.
- **Difficile** : tout ça, plus le suivi de la défausse et des cartes reçues (probabilité de chaque région pour
  chaque adversaire, en tenant compte des 2 régions), dénonciation avec la Vaisselle au-delà de 70 % de confiance,
  bluff (garde une carte d'une autre région) et jamais de carte d'une région probable du voisin (ni de Baguette)
  passée à gauche : elle va au Marché à la place.
- Chaque action des ordinateurs prend 600 à 900 ms.

## Équilibrage : ce que dit la simulation

Simulation v3d, 300 parties par configuration (niveaux mélangés). En v4 (400 parties, niveaux mélangés) : 18,4 / 14,8 / 12,5 tours
selon 2 / 3 / 4 joueurs, aucune manche sans fin, places équilibrées, et facile < moyen ≤ difficile.


| | 2 joueurs | 3 joueurs | 4 joueurs |
|---|---|---|---|
| Tours moyens par manche | 20 | 15 | 12 |
| Manches sans fin | 0 % | 0 % | 0 % |
| Gagnées en Gastronomique / Maison | 42 / 58 % | 51 / 49 % | 58 / 42 % |
| Victoires par niveau (facile / moyen / difficile) | 21 / 60 / 70 % | 23 / 40 / 37 % | 18 / 28 / 29 % |
| Avantage selon la place | aucun | aucun | faible |

Historique des essais (tours moyens par manche, 2 / 3 / 4 joueurs) :

| Version | Tours |
|---|---|
| v1 : 1 région, 4 cartes en main, Menu du Jour | 4 / 2 / 2 (le Menu du Jour gagnait 95 %) |
| v2 : 2 régions à terminer, 8 cartes, 1 carte par tour | 100 / 63 / 40 |
| v2 avec des plats en 2 exemplaires | 122 / 93 / 72 (pire) |
| v2 avec 2 cartes données par tour | 172 / 155 / 120 (pire) |
| v3a : 1 région avec un plat fourni (régions partagées), 2 cartes par tour | 11 / 9 / 6 (blocages possibles à 2 sur la même région) |
| v3b : 1 région unique dont la carte compte comme un plat, 2 cartes par tour | 10 / 8 / 6 (le Volé gagnait 1/3 des manches) |
| v3c : v3b sans menu Volé, coup de pouce | 12 / 9 / 6 |
| v3d : v3c sans coup de pouce, avec 2 Demi-tour + 2 Troc | 20 / 15 / 12 |
| **v4 : annonce face cachée, Dernier service, Marché ouvert, commande, Plat du jour, Chapardeur, Contrôle** | **18 / 15 / 12** |

Le menu **Volé** (les 4 plats d'une autre région) a été supprimé : il gagnait environ un tiers des manches.
Sans coup de pouce et avec les cartes à effet, les manches durent 12 à 20 tours et le niveau des IA compte
nettement plus (l'IA facile ne gagne plus que 18 à 23 % des parties). Le coup de pouce de départ créait un avantage pour les derniers joueurs (34 % contre
19 %) : corrigé, les places sont maintenant équilibrées.