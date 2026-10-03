# BOULET !

Jeu de cartes de défausse familial (un mélange de Uno, Mistigri et Président), jouable au doigt sur téléphone.
Tu affrontes 1 à 3 ordinateurs. Ne finis pas la manche avec le Boulet !

- **Vite + React + TypeScript**, sans backend : tout tourne dans le navigateur.
- **Moteur de règles pur** dans `src/engine/` (aucune dépendance à l'UI), testé avec **Vitest**.
- **PWA** : installable sur l'écran d'accueil, jouable hors ligne.
- **Page `/sim`** : des parties IA contre IA pour tester l'équilibrage.

## Lancer en local

```bash
cd boulet
npm install
npm run dev          # http://localhost:5173
npm test             # tests du moteur
npm run build        # build de production dans dist/
```

## Tester sur ton téléphone (réseau local)

1. Ordinateur et téléphone sur le **même Wi-Fi**.
2. Lance `npm run dev:host` (équivaut à `vite --host`).
3. Vite affiche une adresse « Network », par exemple `http://192.168.1.42:5173`. Ouvre-la sur le téléphone.

Pour tester la version PWA (installation, hors ligne) : `npm run build && npm run preview`, puis ouvre l'adresse « Network ».
Note : le service worker exige HTTPS. Il ne s'active donc qu'en production ou sur `localhost`.

## Déployer sur Vercel

Le jeu se trouve dans le sous-dossier `boulet/` du dépôt. Le portfolio à la racine n'est pas touché.

```bash
cd boulet
npx vercel --prod
```

Tu peux aussi passer par l'interface Vercel : *Add New Project*, choisis ce dépôt, puis règle **Root Directory = `boulet`**.
Le fichier `boulet/vercel.json` fixe déjà le build (`npm run build`, sortie `dist`). Il redirige aussi `/sim` vers l'application.

## Simulation

- Dans le navigateur : `/sim` (ou le lien en bas de l'accueil). Choisis le nombre de parties (1000 par défaut), de joueurs et le niveau des IA.
- En ligne de commande : `npm run sim -- 1000 4 moyen` (parties, joueurs, niveau).

## Arborescence

```
src/engine/   moteur pur : types, paquet, règles (game.ts), IA (ai.ts), tests
src/sim/      simulation + diagnostic d'équilibrage, page /sim
src/ui/       écrans React, cartes et Boulet en SVG fait main, animations
public/       manifest PWA, service worker, icônes
scripts/      sim.ts (simulation CLI), icons.mjs (génère les PNG depuis icon.svg)
```

## Précisions de règles retenues

- Avec le Boulet, on peut finir la manche **seulement** en posant un double ET en donnant le Boulet dans le même coup.
- Deux Jokers forment un double. Après une pioche, seule la carte piochée peut être posée, et toujours seule.
- La carte retournée au départ ne déclenche aucun effet.
- La manche 1 commence par un joueur tiré au hasard. Ensuite, le Boulet officiel commence. Si personne n'a de Boulet officiel, on tire au hasard.
- Un double Passe saute 2 joueurs, au maximum tous les autres. À 2 joueurs, l'Inversion agit comme une Passe.
- Un double Inversion à 3 ou 4 joueurs inverse le sens deux fois : le sens ne change donc pas.
- La manche s'arrête dès qu'une main est vide. L'effet de la dernière carte ne s'applique pas.
