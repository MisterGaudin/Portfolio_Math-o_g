# Visuel des cartes — À TABLE !

- **Format** : poker, 63 × 88 mm (fichier d'impression 69 × 94 mm avec 3 mm de fond perdu, marge de sécurité 4 mm).
- **Palette des 12 régions** : `palette.json` / `palette.png` (couleur, code à 3 lettres, couleur du texte, contraste).
- **Maquette** : `card-mockup.html` → `card-cure-nantais.png` (d'après le croquis : type de plat + code région en haut à
  gauche, titre en cartouche, région, carte de France, illustration, texte court, frise du menu, QR « Scanne-moi »).
- Illustrations : style « livre illustré » (gouache numérique, contours bruns, pastels), le plat en vedette, un paysage
  de la région au fond, sans personnage.

## Génération des illustrations (Higgsfield, modèle GPT Image 2.5, format 3:4, qualité medium)

**Règle anti-plagiat** : la carte de référence (« Kiwi ») sert UNIQUEMENT pour la technique (trait brun fait main,
gouache texturée, harmonie pastel, lumière douce). La composition doit être originale : pas de chemin vers
l'horizon, pas de colline avec un bâtiment en haut à droite, pas de bande de rochers et de fleurs en bas, pas de
personnage, de château, de texte ni de cadre.

Formule par carte Plat : « nature morte » à hauteur d'yeux, le plat en grand en bas au centre sur un support typique
(ardoise, planche, plat en terre…), et derrière, un peu flou, un décor propre à la région (ex. Bretagne : port, bateaux
de pêche, quai en granit, phare rayé). Palette de la région en touches (voir `palette.json`).

**Contours** : toujours des contours d'encre brun-noir faits main, irréguliers, d'épaisseur variable, autour de chaque
forme (plat, support, décor, nuages), avec quelques petits traits intérieurs : c'est ce qui donne le côté « humain ».

## Analyse détaillée de la référence (zooms sur le ciel, le personnage, les rochers, l'herbe, le château)

1. **Aplats façon BD (cel-shading), pas de peinture** : couleurs en aplats avec UNE seule teinte d'ombre, quasiment
   pas de dégradés, rien de flou. Un léger grain d'impression par-dessus les aplats.
2. **Deux plans de dessin** :
   - premier et deuxième plan (personnage, sac, rochers, herbes, fleurs, sol) : **contour d'encre presque noir,
     épais, net et sûr**, extrémités affinées, formes fermées, peu de traits intérieurs (pas un trait tremblé) ;
   - arrière-plan (ciel, nuages, château, collines lointaines) : **aucun contour**, seulement des aplats pastel doux,
     peu contrastés : c'est ce qui crée la profondeur.
3. **Palette un peu poudrée, pas « bonbon »** : vert sauge, vert mousse/olive, indigo-violet, rose ancien, orange,
   crème, pervenche. Le noir des contours est un noir chaud (#1A1414).
4. **Nuages** : formes festonnées superposées en aplats (rose pâle, jaune beurre, pervenche, blanc), petites étoiles
   scintillantes blanches, un croissant de lune.
5. **Petits gribouillis décoratifs** : sur les zones sombres, petites touffes d'herbe en « m », pousses de feuilles,
   petites croix (coutures) : dessinés en trait clair (vert pâle, crème).
6. **Formes simples, rondes et trapues**, peu de détails, très lisibles ; lumière traitée en aplat (faisceau crème,
   halo doux).

## ✅ Formule validée (Curé nantais, job Higgsfield 05473772 / 14bfca1e)

Modèle `gpt_image_2_5`, format 3:4, qualité `high` (1,5 crédit par image), référence de style : la carte Kiwi
(media `c8359043-cf4d-4d2d-8c9a-c906e34a087b`). Gabarit du prompt :

> Match the RENDERING of the reference card exactly, but invent a completely different composition and subject (do not
> reuse its path, hill, castle, rock strata band, cat or layout). Rendering rules: (1) modern flat cel-shaded comic
> illustration, NOT painterly, NOT blurry; (2) every foreground and middle-ground object has a bold, clean, confident
> near-black ink outline (#1a1414), smooth with slightly tapered ends, closed contours, sparse interior detail lines;
> (3) the far background has NO outlines at all: only flat, soft, low-contrast pastel shapes; (4) flat colour fills with
> a single simple shadow tone, subtle grainy print texture; (5) muted, slightly dusty palette; (6) layered scalloped
> pastel clouds with tiny sparkle stars; (7) small light doodles on dark areas ('m'-shaped grass tufts, leaf sprouts).
> SUBJECT: {plat en grand au centre bas, sur son support} — middle ground (outlined): {éléments typiques de la région}
> — far background (no outlines): {paysage de la région} — framing: {fleurs/plantes de la région aux coins}.
> No text, no letters, no frame, full-bleed.

## Mise en page « pleine image » (validée)

- Liseré blanc de 2,4 mm aux coins arrondis, comme la carte Kiwi ; l'illustration remplit tout l'intérieur.
- Titre posé directement sur le ciel (grand, à empattements), région en italique dessous.
- Badges ronds aux coins : type de plat sur la couleur de la région (haut gauche), carte de France (haut droite),
  code région dessous.
- En bas, bandeau crème semi-transparent : 2 lignes de texte + frise du menu ; QR de 7 mm (« Recette ») dans le bandeau.
- Composition des illustrations : **haut calme** (ciel) pour le titre, **bas assez calme** pour le bandeau, plat au centre.
  Ajouter au prompt : "keep the top fifth as calm open sky for a title and the bottom fifth calm and simple for a
  caption band; the hero dish sits in the middle of the frame".
