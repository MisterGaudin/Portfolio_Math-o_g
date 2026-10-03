# À TABLE !

Jeu de cartes familial sur les spécialités des régions de France, jouable au doigt sur téléphone.
Tu affrontes 1 à 3 ordinateurs. Le but : réunir un menu complet (Entrée, Plat, Fromage, Dessert) et décrocher 3 Toques pour devenir **Grand Chef**.

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
  niveau des IA (dont « mixte », niveaux répartis au hasard autour de la table) et variante de règle à tester.
- En ligne de commande : `npm run sim -- 1000 moyen standard` (parties, niveau, variante, puis éventuellement les nombres de joueurs).

## Arborescence

```
src/config/   cartes, régions, couleurs, icônes (à modifier librement)
src/engine/   moteur pur : types, paquet et menus (deck.ts), règles (game.ts), IA (ai.ts), tests
src/sim/      simulation + diagnostic d'équilibrage, page /sim
src/ui/       écrans React, table, animations, tutoriel
public/       manifest PWA (chemins en /atable/), service worker, icônes, cards/ pour tes illustrations
scripts/      sim.ts (simulation CLI), card-ids.ts, icons.mjs (génère les PNG depuis icon.svg)
```

## Précisions de règles retenues

Là où l'énoncé laissait un choix, voici ce que fait le moteur :

- **Régions en jeu publiques** : elles sont affichées sur la table (elles se devinent de toute façon avec les cartes).
- **Réserve des régions** = les 2 régions leurres non distribuées. Après une dénonciation juste, l'accusé pioche
  une nouvelle région dans la réserve, puis y remet l'ancienne (la réserve garde 2 cartes).
- **Vaisselle lors d'une dénonciation** : pour que chacun garde 4 cartes, celui qui reçoit la Vaisselle rend à son
  ancien porteur une carte tirée au hasard. Si l'accusé (ou l'accusateur, si c'est faux) l'avait déjà, rien ne bouge.
- **Ordre des dénonciations** : en début de tour, les ordinateurs décident d'abord (le premier dans l'ordre des
  joueurs l'emporte). S'aucun n'a dénoncé, tu peux le faire tant que tu n'as pas validé ta carte. Une dénonciation
  annule les choix déjà faits ce tour-ci (les mains ont changé).
- **Marché** : les cartes du Marché arrivent sur la défausse, puis les voisins piochent dans l'ordre des joueurs.
  Si la pioche se vide, la défausse est remélangée (y compris pendant l'échange).
- **Annonce** : simultanée, après l'échange. Le joueur humain peut aussi choisir « Attendre ».
- **Sécurité** : au-delà de 60 tours sans annonce, la manche s'arrête sans gagnant (ça n'arrive pas en pratique).

## IA

- **Facile** : passe au hasard une carte qui n'est pas de sa région, annonce dès qu'elle peut, ne dénonce jamais.
- **Moyen** : garde ses cartes de région, refile toujours la Vaisselle, lâche d'abord les cartes « en double »
  (même type de plat). Une carte inutile *pour elle et pour son voisin* (il s'est déjà débarrassé de cette région)
  part au Marché, sinon elle est passée. Avec 3 cartes de sa région, elle attend le Gastronomique (patience limitée).
  Si la manche s'éternise (plus de 6 tours), elle renouvelle ses cartes au Marché.
- **Difficile** : tout ça, plus le suivi de la défausse et des cartes reçues (probabilité de région pour chaque
  adversaire), dénonciation au-delà de 70 % de confiance, bluff (garde une carte d'une autre région) et jamais de
  carte de la région probable du voisin (ni de Baguette) passée à gauche : elle va au Marché à la place.
- Chaque action des ordinateurs prend 600 à 900 ms.

## Équilibrage : ce que dit la simulation

1000 parties par configuration, règle officielle :

| | 2 joueurs | 3 joueurs | 4 joueurs |
|---|---|---|---|
| Tours moyens par manche (moyen) | 3,7 | 2,3 | 1,6 |
| Manches gagnées en Menu du Jour | 93 % | 97 % | 99 % |
| Manches gagnées en Gastronomique | 2,5 % | 1,2 % | 0,5 % |
| Manches au départage | 0 % | 15 % | 27 % |
| Gagnées grâce au Marché | 61 % | 9 % | 0,6 % |
| Dénonciations réussies (difficile) | 100 % (0,19/manche) | rares | aucune |
| Avantage selon la place | aucun | aucun | aucun |

**⚠ Le Menu du Jour est beaucoup trop facile.** Avec 6 régions, 4 cartes de types différents arrivent presque
toutes seules : à 4 joueurs, une manche dure moins de 2 tours et la donne décide presque tout. Les menus régionaux,
la dénonciation et le bluff n'ont pas le temps de compter. Variantes testées (`/sim`, niveau mixte) :

| Variante du Menu du Jour | Tours (2 / 3 / 4 j.) | Menu du Jour gagnant |
|---|---|---|
| Règle officielle | 3,7 / 2,3 / 1,7 | 90 % / 96 % / 98 % |
| Sans Baguette | 6,5 / 3,5 / 2,4 | 73 % / 91 % / 96 % |
| 2 régions maximum | 6,1 / 4,9 / 4,5 | 83 % / 89 % / 91 % |
| Au moins 2 cartes de ta région | 7,2 / 5,2 / 4,6 | 83 % / 90 % / 93 % |
| Pas de Menu du Jour | 17 / 15 / 14 | 0 % (Gastronomique 54-68 %) |

Pistes : supprimer le Menu du Jour, ou le garder mais en ne rapportant qu'une demi-Toque, ou interdire d'annoncer
au premier tour. Sans Menu du Jour, le niveau difficile prend nettement l'avantage (87 % à 2 joueurs) : la déduction
compte enfin. Autre point : à 2 joueurs, la dénonciation de l'IA difficile réussit toujours. Le voisin passe chaque
carte refusée à son seul adversaire, ce qui trahit sa région.
