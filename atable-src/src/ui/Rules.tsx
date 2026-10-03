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
          <b>Ta région secrète</b> : ses 4 cartes (Entrée, Plat, Fromage, Dessert) forment le meilleur menu. Tu as toujours 4 cartes.
        </p>
        <p>
          <b>Chaque tour</b>, tout le monde en même temps :
        </p>
        <ol>
          <li>
            <b>Dénoncer</b> (facultatif, un seul par tour) : « Je te démasque : Alsace ! ». Juste : il prend la Vaisselle et change de région. Faux : c’est toi qui la prends.
          </li>
          <li>
            Choisis une carte : <b>Passer</b> (à ton voisin de gauche, face cachée) ou <b>Marché</b> (face visible à la défausse, ton voisin pioche à la place).
          </li>
          <li>Tout le monde valide, les cartes glissent vers la gauche.</li>
          <li>
            Menu complet ? Crie <b>« À TABLE ! »</b>
          </li>
        </ol>
        <p>
          <b>Menus</b>, du plus fort au plus faible : <b>Gastronomique</b> (ta région, sans Baguette) › <b>Maison</b> (ta région + Baguette) › <b>Volé</b>{' '}
          (une autre région) › <b>Menu du Jour</b> (régions mélangées).
        </p>
        <p>
          🥖 <b>Baguette</b> : joker. 🍽️ <b>Vaisselle</b> : impossible d’annoncer avec, et jamais au Marché.
        </p>
        <p>
          <b>Égalité</b> : le plus proche à gauche du porteur de la Vaisselle gagne. En fin de manche, chacun révèle sa région !
        </p>
      </div>
    </Modal>
  );
}
