// Règles du jeu, en français et en moins de 200 mots.
import { Modal } from './Modal';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Règles d’À TABLE !" onClose={onClose}>
      <div className="rules">
        <p>
          <b>But :</b> gagner 3 Étoiles et devenir <b>Chef 3 étoiles</b>.
        </p>
        <p>
          Chaque manche, tu reçois <b>une région secrète</b> (chacun la sienne) et 8 cartes. Ta carte Région compte comme un de ses plats (★) : trouve les{' '}
          <b>3 autres</b>. La vraie carte de ce plat ne te sert à rien : donne-la pour <b>bluffer</b> !
        </p>
        <p>
          <b>Chaque tour</b>, tous ensemble, choisissez <b>2 cartes</b> : <b>Passer</b> au voisin ou <b>Marché</b> (défausse, le voisin pioche à la place).
          Menu complet ? Crie <b>« À TABLE ! »</b>
        </p>
        <p>
          🍽️ <b>Vaisselle</b> : pas d’annonce avec, jamais au Marché. Elle seule permet de <b>dénoncer</b> (« Je te démasque : Alsace ! »). Juste : il prend
          ta Vaisselle et change de région, puis il est protégé. Faux : tu la gardes et tu attends un tour.
        </p>
        <p>
          🥖 <b>Baguette</b> : remplace un plat manquant (menu <b>Maison</b>, battu par le <b>Gastronomique</b>).
        </p>
        <p>
          ✨ <b>Cartes à effet</b>, jouées puis retirées du jeu : 🔄 <b>Demi-tour</b> inverse le sens de passage, 🤝 <b>Troc</b> échange ta main avec celle
          d’un joueur.
        </p>
        <p>
          <b>Égalité</b> : le plus proche du porteur de la Vaisselle, dans le sens du jeu, gagne.
        </p>
      </div>
    </Modal>
  );
}
