// Règles du jeu, en français et en moins de 200 mots.
import { Modal } from './Modal';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Règles d’À TABLE !" onClose={onClose}>
      <div className="rules">
        <p>
          <b>But :</b> 3 étoiles ⭐ pour devenir <b>Chef 3 étoiles</b>. De 2 à 6 chefs.
        </p>
        <p>
          Chacun a <b>une région secrète</b> et 8 cartes. Ta carte Région compte comme un de ses plats (★) : trouve les <b>3 autres</b>. Le vrai plat ne te sert
          à rien : donne-le pour bluffer !
        </p>
        <p>
          <b>Chaque tour</b>, ensemble : une carte à ton <b>voisin</b>, une au <b>Marché</b> (face visible). Ton voisin pioche, ou prend la carte visible.
        </p>
        <p>
          📝 <b>Commande</b> (une par tour, deux en Duel) : « Bob, as-tu le Munster ? » S’il l’a, il doit te le servir (interdit de mentir !) et tu lui rends une carte. Tout le monde entend…
        </p>
        <p>
          🔔 Menu complet ? Crie <b>« À TABLE ! »</b>. Les autres jouent un <b>Dernier service</b>. Chaque menu complet rapporte une étoile ; le meilleur gagne la manche :
          <b> Gastronomique</b> › <b>Maison</b> (avec la 🥖 Baguette).
        </p>
        <p>
          🍽️ <b>Vaisselle</b> : pas d’annonce avec. Elle seule permet de <b>dénoncer</b> (une fois par manche). Juste : il prend la Vaisselle et change de région. Faux :
          tu la gardes. Elle ne bouge plus ce tour-ci.
        </p>
        <p>
          🥖 Dès la 1re étoile gagnée, le chef qui en a le moins (à égalité : le plus jeune) commence avec la Baguette. 🦊 Chapardeur : vole une carte au hasard. Chaque manche, un <b>Plat du jour</b> change une règle.
        </p>
      </div>
    </Modal>
  );
}
