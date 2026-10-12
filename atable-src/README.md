# À TABLE !

Jeu de cartes familial sur les spécialités des régions de France, jouable au doigt sur téléphone.
Tu affrontes 1 à 5 ordinateurs (2 à 6 chefs). Le but : terminer le menu de ta région secrète (Entrée, Plat, Fromage, Dessert) en passant commande aux autres chefs (« Bob, du Munster, tu en as ? »), et décrocher 3 Étoiles pour devenir **Chef 3 étoiles**.

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

Note de fun /100 par configuration (barème figé, voir plus bas) : `npm run score -- 400`. Détail des mesures : `npm run fun -- 300`.
Un débutant qui garde sa région et passe le reste, contre les IA : `npm run naive`.

## Arborescence

```
src/config/   cartes, régions, couleurs, icônes (à modifier librement)
src/engine/   moteur pur : types, paquet et menus (deck.ts), règles (game.ts), IA (ai.ts), tests
src/sim/      simulation + diagnostic d'équilibrage, page /sim
src/ui/       écrans React, table, animations, tutoriel
public/       manifest PWA (chemins en /atable/), service worker, icônes, cards/ pour tes illustrations
scripts/      sim.ts (simulation CLI), card-ids.ts, icons.mjs (génère les PNG depuis icon.svg)
```

## Règles (version 5)

- **2 à 6 joueurs**, 8 cartes en main (7 à 6 joueurs).
- **Toutes les régions** (12) sont en jeu : 48 plats + Baguette + Vaisselle + 2 Chapardeur = 52 cartes (+ 8 cartes Plat du jour). **Pas de carte Région.**
- **Plat secret** : en début de manche, on prend **un plat de chaque région** (au hasard), on les mélange et on en
  donne un à chacun, face cachée, **gardé à part** (hors de la main). Il compte dans le menu et **sa région est
  celle à compléter** : il reste **3 plats à trouver**. Les plats non distribués retournent dans la pioche ; en
  **Duel**, ils restent à part, face cachée (réserve des plats secrets). Chaque région n'est donc tenue que par un joueur.
- **Chaque tour, 2 cartes données en même temps : une au voisin, une au Marché** (face visible). Le voisin de
  celui qui va au Marché pioche, ou prend la carte visible de la défausse (**Marché ouvert**).
- 📝 **Commande servie** (façon 7 familles), **une par tour, deux en Duel** : « Bob, du Munster, tu en as ? ». S'il
  l'a, il doit le servir (**interdit de mentir**), et on lui rend une carte de son choix (même la Vaisselle !). La question et la réponse
  sont publiques : tout le monde apprend ce que tu cherches…
- 🔔 **« À TABLE ! »** dès que le menu est complet. Les autres jouent un **Dernier service** (seul, on met ses 2
  cartes au Marché). Puis on révèle : **chaque menu complet rapporte une étoile**, le meilleur gagne la manche :
  **Gastronomique** (sans Baguette) › **Maison** (la Baguette remplace un plat manquant).
- 🍽️ **Vaisselle** : toujours dans une main, visible de tous, jamais au Marché, pas d'annonce avec. Seul son
  porteur peut **dénoncer**, **une fois par manche** : juste, l'accusé prend la Vaisselle, montre son plat secret, le pose au Marché et en pioche un nouveau (en Duel : dans la réserve des plats secrets) ;
  faux, l'accusateur la garde. Après une dénonciation, **la Vaisselle ne bouge plus jusqu'au tour suivant**.
- 🥖 **Coup de main** : tant que personne n'a d'étoile, la Baguette est distribuée au hasard. Ensuite, en début de
  manche, le chef qui a le moins d'étoiles la reçoit ; à égalité, c'est **le plus jeune**.
- 🦊 **Chapardeur** (2 cartes) : se joue à la place de la carte du Marché ; on vole une carte au hasard au joueur
  visé et on lui en rend une.
- **Plat du jour** : une carte tirée à chaque manche change une règle (fromages au Marché, sens inversé — pas en
  Duel —, pas de Baguette, 3 cartes par tour, pas de dénonciation, 2 étoiles, 2 commandes).
- **Étoiles** : le premier à 3 étoiles devient **Chef 3 étoiles**.

Tous ces réglages sont dans `DEFAULT_RULES` (`src/engine/game.ts`) ; la version 4 reste disponible (`V4_RULES`) pour comparer. L'ancienne version « 2 menus » reste disponible
(`TWO_MENUS_RULES`) pour la simulation.

## Précisions techniques

- **Ordre des dénonciations** : en début de tour, l'ordinateur qui a la Vaisselle décide d'abord. Sinon, tu peux
  dénoncer (si tu as la Vaisselle) tant que tu n'as pas validé ta carte. Une dénonciation annule les choix déjà
  faits ce tour-ci (les mains ont changé).
- **Marché** : les cartes du Marché arrivent sur la défausse (dans un ordre tiré au hasard), puis les voisins
  piochent (ordre de service tiré au hasard). Si la pioche se vide, la défausse est remélangée.
- **Commandes** : avant de valider ses cartes. Les ordinateurs commandent à tour de rôle (le premier change à
  chaque tour). Si une commande te prend une carte que tu avais déjà choisie, tu choisis à nouveau.
- **Annonce** : simultanée, après l'échange. Le joueur humain peut aussi choisir « Attendre ».
- **Sécurité** : au-delà de 200 tours sans annonce, la manche s'arrête sans gagnant.
- Les régions et leur avancement sont cachés à l'écran tant que tu ne tapes pas sur « Mes régions ».

## IA

- **Facile** : donne des cartes au hasard (hors de sa région), commande une fois sur deux, annonce dès qu'elle
  peut, ne dénonce jamais.
- **Moyen** : garde ses cartes de région, refile toujours la Vaisselle (en la passant ou en la rendant après une
  commande servie), commande chaque tour un plat qui lui manque sans redemander à qui vient de dire non, dénonce
  quand elle est sûre (75 %).
- **Difficile** : tout ça, plus le suivi des indices (cartes reçues, Marché, commandes des autres : demander le
  Munster, c'est avouer l'Alsace…), dénonciation dès 55 % de confiance, commandes bluffées une fois sur six, et
  jamais de carte d'une région probable du voisin passée à gauche (elle va au Marché).
- Chaque action des ordinateurs prend 600 à 900 ms.

## Barème de fun (note sur 100)

Une note calculée automatiquement à partir de parties IA contre IA (`npm run score -- 400`, code dans
`src/sim/fun.ts`). Le barème a été **figé avant de toucher aux règles**, calibré pour retrouver les notes données à
la main à la version 4 :

| Critère | Points | Mesure |
|---|---|---|
| Thème | 5 | gastronomie des régions |
| Rejouabilité | 10 | 12 régions, Plat du jour, cartes à effet |
| Accessibilité | 10 | nombre de règles à expliquer |
| Durée et rythme | 10 | durée estimée d'une partie, manches interminables, tours où l'on progresse |
| Tension | 15 | perdants à un plat du but, fins serrées, gagnants qui ont été menés |
| Interaction | 15 | actions qui touchent les autres (commandes, effets, dénonciations) |
| Retournements et équilibre | 10 | places, 3-0, poids de la 1re manche, changements de leader |
| Part du talent | 10 | écart difficile / facile, et un débutant « naïf » ne doit pas battre l'IA difficile |
| Décisions | 15 | progression, part des progrès obtenus par ses propres choix, choix serrés |

| | Duel | 3 joueurs | 4 joueurs | 5 joueurs | 6 joueurs |
|---|---|---|---|---|---|
| **v4** | 58 | 59 | 65 | — | — |
| v5 (cartes Région) | 78–80 | 85 | 86 | 86 | 84 |
| **v5 plat secret** | **81** | **85–86** | **86** | **85** | **84–85** |
| Durée estimée d'une partie (v5) | ≈ 28 min | ≈ 28 min | ≈ 28 min | ≈ 32 min | ≈ 35 min |
| Tours par manche (v5) | 10 | 7 | 5 | 5 | 5 |

À 5 et 6 joueurs, la pioche est presque vide après la donne (48 cartes en main sur 52) : le Marché est remélangé
dès qu'elle s'épuise, ce qui fait tourner les cartes plus vite. Tester 6 ou 7 cartes en main n'apportait rien.

**Plat secret (sans carte Région)** : les plats secrets sortent du paquet, donc à 6 joueurs on passe à 7 cartes en
main (sinon la pioche ne suffit pas). En Duel, laisser les 10 plats non distribués retourner dans la pioche faisait
tomber la note à 77 : après une dénonciation, le nouveau plat secret pouvait être de la région de l'adversaire et les
manches s'éternisaient (15 tours). Les garder à part, face cachée, pour ces repioches la remonte à 81.

Ce qui a fait monter la note : la **commande servie** (on va chercher ses plats au lieu d'attendre ce que le voisin
veut bien donner), **une carte au voisin et une au Marché** (sans Marché obligatoire, garder et tout passer était la
meilleure stratégie et bloquait les manches), **une étoile pour chaque menu complet** au Dernier service et la
**Baguette au chef en retard** (plus de retournements), la Vaisselle qui **ne bouge plus après une dénonciation**
(à 2, elle revenait aussitôt à l'accusateur), et des règles retirées (annonce bluffée, carte montrée, Demi-tour,
Troc, Contrôle sanitaire, Inspection, Dégustation).

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
| v4 : annonce face cachée, Dernier service, Marché ouvert, commande, Plat du jour, Chapardeur, Contrôle | 18 / 15 / 12 |
| **v5 : commande servie, une carte au voisin et une au Marché, étoile pour tout menu servi, Baguette au chef en retard** | **10 / 7 / 5** |

Le menu **Volé** (les 4 plats d'une autre région) a été supprimé : il gagnait environ un tiers des manches.
Sans coup de pouce et avec les cartes à effet, les manches durent 12 à 20 tours et le niveau des IA compte
nettement plus (l'IA facile ne gagne plus que 18 à 23 % des parties). Le coup de pouce de départ créait un avantage pour les derniers joueurs (34 % contre
19 %) : corrigé, les places sont maintenant équilibrées.