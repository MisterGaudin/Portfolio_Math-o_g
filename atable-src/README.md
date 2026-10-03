# À TABLE !

Jeu de cartes familial sur les spécialités des régions de France, jouable au doigt sur téléphone.
Tu affrontes 1 à 3 ordinateurs. Le but : terminer les menus de tes 2 régions secrètes (Entrée, Plat, Fromage, Dessert) et décrocher 3 Toques pour devenir **Grand Chef**.

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

## Règles (version 2)

- **Toutes les régions** (12) sont en jeu à chaque manche : 48 plats + Baguette + Vaisselle = 50 cartes.
- **2 régions secrètes par joueur**, découvertes au début de chaque manche (écran « Découvrir mes régions »).
  Les cartes Région non distribuées forment la **réserve des régions**.
- **8 cartes en main.** On gagne la manche avec **2 menus complets** : les 4 plats (Entrée, Plat, Fromage, Dessert)
  d'une même région, deux fois. **Plus de régions mélangées.** La **Baguette** remplace un seul plat manquant.
- **Annonces**, de la plus forte à la plus faible : **Gastronomique** (tes 2 régions, sans Baguette) ›
  **Maison** (tes 2 régions, avec la Baguette) › **Volé** (au moins un menu d'une région qui n'est pas à toi).
- **Dénonciation réservée au porteur de la Vaisselle** (avant de choisir sa carte, une par tour) :
  - juste (c'est une des 2 régions de l'accusé) : l'accusé prend la Vaisselle (et rend une carte au hasard pour
    que chacun garde 8 cartes), défausse la région démasquée et en **pioche une nouvelle dans la réserve** ;
    l'ancienne retourne dans la réserve. Ce qu'on savait sur lui ne sert plus à rien : **pas d'anti-jeu possible**.
    Un joueur démasqué est ensuite **protégé 🛡️ jusqu'à la fin de la manche** ;
  - fausse : l'accusateur garde la Vaisselle et ne peut pas dénoncer au tour suivant.
- **Coup de pouce à la donne** : chacun reçoit au moins 1 carte de chacune de ses régions.
- Inchangé : échange simultané vers la gauche, Marché, Vaisselle jamais au Marché ni d'annonce avec,
  départage par la Vaisselle, 3 Toques pour devenir Grand Chef.

Les réglages « protection » et « coup de pouce » sont dans `DEFAULT_RULES` (`src/engine/game.ts`) et se testent
sur la page `/sim`.

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

300 parties par configuration, règles par défaut (protection + coup de pouce) :

| | 2 joueurs | 3 joueurs | 4 joueurs |
|---|---|---|---|
| Tours moyens par manche (IA moyennes) | 82 | 62 | 41 |
| Tours moyens par manche (niveaux mélangés) | 66 | 44 | 31 |
| Gagnées en Gastronomique / Maison / Volé | 61 / 39 / 0 % | 70 / 29 / 1 % | 73 / 27 / 0 % |
| Dénonciations par manche (niveaux mélangés) | 0,5 | 0,5 | 0,1 |
| Dénonciations réussies | 100 % | 100 % | 100 % |
| Victoires par niveau (facile / moyen / difficile) | — | 11 / 31 / 58 % | 13 / 28 / 35 % |
| Avantage selon la place | aucun | aucun | faible |

**⚠ À surveiller :**
- **Les manches sont longues, surtout à 2 joueurs** (60 à 80 tours, 120 entre IA difficiles). Il faut réunir 8 cartes
  précises parmi 50, et on n'en reçoit qu'une par tour. À 4 joueurs, on est autour de 30 à 40 tours.
- **Sans la protection après une dénonciation**, les IA difficiles se dénoncent en boucle : chaque dénonciation
  juste fait changer une région, et plus personne ne termine. Avec 2 joueurs, 76 % des manches n'aboutissaient pas.
- Le menu **Volé** ne gagne quasiment jamais : il faudrait réunir 4 cartes d'une région qui n'est pas la tienne.
- Les dénonciations de l'IA difficile réussissent toujours : un joueur qui garde sa région et refile le reste
  se trahit vite.

Pistes pour raccourcir si besoin : coup de pouce de 2 cartes par région (environ −30 % de tours), ou 2 Toques pour
gagner au lieu de 3.
