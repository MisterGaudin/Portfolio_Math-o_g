// Règles du jeu, en français et en moins de 200 mots.
import { Modal } from './Modal';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Règles d’À TABLE !" onClose={onClose}>
      <div className="rules">
        <p>
          <b>But :</b> 3 étoiles ⭐ pour devenir <b>Chef 3 étoiles</b>.
        </p>
        <p>
          Chacun a <b>une région secrète</b> et 8 cartes. Ta carte Région compte comme un de ses plats (★) : trouve les <b>3 autres</b>. Le vrai plat ne te sert
          à rien : donne-le pour bluffer !
        </p>
        <p>
          <b>Chaque tour</b>, ensemble : donnez <b>2 cartes</b>, passées au voisin ou au <b>Marché</b> (défausse). Le voisin prend alors la pioche ou la carte
          visible.
        </p>
        <p>
          <b>« À TABLE ! »</b> : main posée face cachée (bluff permis). Les autres ont un <b>Dernier service</b>, puis on révèle. Meilleur menu :
          <b> Gastronomique</b> › <b>Maison</b> (avec la 🥖 Baguette). Bluff raté : −1 ⭐ et la Vaisselle.
        </p>
        <p>
          🍽️ <b>Vaisselle</b> (visible) : pas d’annonce avec. Elle seule permet de <b>dénoncer</b> en montrant une carte. Juste : il prend la Vaisselle,
          change de région et te donne une carte contre celle montrée. Faux : tu attends un tour.
        </p>
        <p>
          📝 <b>Commande</b> (une par manche) : « Qui a le Reblochon ? »
        </p>
        <p>
          ✨ <b>Effets</b> : 🔄 Demi-tour, 🤝 Troc, 🦊 Chapardeur, 🚫 Contrôle sanitaire. Chaque manche, un <b>Plat du jour</b> change une règle.
        </p>
      </div>
    </Modal>
  );
}
