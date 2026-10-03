# À TABLE !

Jeu de cartes familial sur les spécialités des régions de France, jouable au doigt sur téléphone.
Tu affrontes 1 à 3 ordinateurs. Le but : terminer le menu de ta région secrète (Entrée, Plat, Fromage, Dessert) et décrocher 3 Toques pour devenir **Grand Chef**.

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

## Règles (version 3)

- **Toutes les régions** (12) sont en jeu à chaque manche : 48 plats + Baguette + Vaisselle = 50 cartes.
- **1 région secrète par joueur**, découverte au début de chaque manche. Chaque carte Région **apporte déjà un plat**
  (ex. « Savoie + Plat » : la Tartiflette est acquise) : il reste **3 plats à trouver**. Il existe 48 cartes Région
  (12 régions × 4 plats) : **plusieurs joueurs peuvent avoir la même région**. Les cartes Région non distribuées
  forment la réserve.
- **8 cartes en main, 2 cartes données par tour** : chacune passée au voisin de gauche ou mise au Marché.
- **Annonces** : **Gastronomique** (ta région, sans Baguette) › **Maison** (ta région, la Baguette remplace un plat)
  › **Volé** (les 4 plats d'une autre région, ou 3 + la Baguette). Plus de régions mélangées.
- **Dénonciation réservée au porteur de la Vaisselle** (avant de choisir ses cartes, une par tour) :
  - juste : l'accusé prend la Vaisselle (et rend une carte au hasard), remplace sa carte Région par une carte de la
    réserve (d'une autre région) et l'ancienne y retourne : ce qu'on savait sur lui ne sert plus, **pas d'anti-jeu** ;
    il est ensuite **protégé 🛡️ jusqu'à la fin de la manche** ;
  - fausse : l'accusateur garde la Vaisselle et ne peut pas dénoncer au tour suivant.
- **Coup de pouce à la donne** : chacun reçoit au moins 1 carte de sa région.
- Inchangé : échange simultané vers la gauche, Vaisselle jamais au Marché ni d'annonce avec, départage par la
  Vaisselle, 3 Toques pour devenir Grand Chef.

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

300 parties par configuration, règles par défaut (niveaux mélangés) :

| | 2 joueurs | 3 joueurs | 4 joueurs |
|---|---|---|---|
| Tours moyens par manche | 11 | 9 | 6 |
| Manches sans fin | 0 % | 0 % | 0 % |
| Gagnées en Gastronomique / Maison / Volé | 35 / 39 / 26 % | 37 / 34 / 29 % | 45 / 33 / 22 % |
| Victoires par niveau (facile / moyen / difficile) | 27 / 55 / 68 % | 12 / 38 / 50 % | 15 / 28 / 32 % |
| Avantage selon la place | aucun | aucun | faible |

Historique des essais (tours moyens par manche, 2 / 3 / 4 joueurs) :

| Version | Tours |
|---|---|
| v1 : 1 région, 4 cartes en main, Menu du Jour | 4 / 2 / 2 (le Menu du Jour gagnait 95 %) |
| v2 : 2 régions à terminer, 8 cartes, 1 carte par tour | 100 / 63 / 40 |
| v2 avec des plats en 2 exemplaires | 122 / 93 / 72 (pire) |
| v2 avec 2 cartes données par tour | 172 / 155 / 120 (pire) |
| **v3 : 1 région avec un plat fourni, 2 cartes par tour** | **11 / 9 / 6** |

**À surveiller :** le menu **Volé** gagne environ un quart des manches. Avec 8 cartes en main et 2 cartes qui
tournent par tour, réunir les 4 plats d'une autre région arrive assez souvent. Si on veut que sa propre région
compte davantage, on peut interdire le Volé ou exiger qu'il soit sans Baguette.
