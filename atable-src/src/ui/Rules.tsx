// Règles du jeu, en français et en moins de 200 mots.
import { Modal } from './Modal';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Règles d’À TABLE !" onClose={onClose}>
      <div className="rules">
        <p>
          <b>But :</b> gagner 3 Toques et devenir <b>Grand Chef</b>.
        </p>
        <p>
          Chaque manche, tu reçois <b>une région secrète</b> (chacun la sienne) et 8 cartes. Ta carte Région compte comme un de ses plats (★) : trouve les{' '}
          <b>3 autres</b>. La vraie carte de ce plat ne te sert à rien : donne-la pour <b>bluffer</b> !
        </p>
        <p>
          <b>Chaque tour</b>, tout le monde en même temps choisit <b>2 cartes</b> : chacune est <b>passée</b> au voisin de gauche, face cachée, ou va au{' '}
          <b>Marché</b> (face visible, le voisin pioche à la place). Puis on valide, et les cartes glissent vers la gauche. Menu complet ? Crie{' '}
          <b>« À TABLE ! »</b>
        </p>
        <p>
          🍽️ <b>Vaisselle</b> : impossible d’annoncer avec, jamais au Marché. Mais elle seule permet de <b>dénoncer</b> : « Je te démasque : Alsace ! ». Juste :
          il prend ta Vaisselle, change de région, puis il est protégé jusqu’à la fin de la manche. Faux : tu la gardes et tu attends un tour.
        </p>
        <p>
          🥖 <b>Baguette</b> : remplace un plat manquant.
        </p>
        <p>
          <b>Annonces</b> : Gastronomique (ta région) › Maison (avec la Baguette) › Volé (les 4 plats d’une autre région). Égalité : le plus proche à gauche du
          porteur de la Vaisselle gagne.
        </p>
      </div>
    </Modal>
  );
}
