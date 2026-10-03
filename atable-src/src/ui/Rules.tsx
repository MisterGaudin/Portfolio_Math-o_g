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
          Chaque manche, tu reçois <b>2 régions secrètes</b> et 8 cartes. Gagne en réunissant leurs <b>2 menus complets</b> (Entrée, Plat, Fromage,
          Dessert de chaque région), sans mélange.
        </p>
        <p>
          <b>Chaque tour</b>, tout le monde en même temps :
        </p>
        <ol>
          <li>
            Choisis une carte : <b>Passer</b> (à ton voisin de gauche, face cachée) ou <b>Marché</b> (face visible à la défausse, ton voisin pioche à la place).
          </li>
          <li>Tout le monde valide, les cartes glissent vers la gauche.</li>
          <li>
            Menus complets ? Crie <b>« À TABLE ! »</b>
          </li>
        </ol>
        <p>
          🍽️ <b>Vaisselle</b> : impossible d’annoncer avec, jamais au Marché. Mais elle seule permet de <b>dénoncer</b> : « Je te démasque : Alsace ! ». Juste :
          il prend ta Vaisselle et change cette région, puis il est protégé jusqu’à la fin de la manche. Faux : tu la gardes et tu attends un tour.
        </p>
        <p>
          🥖 <b>Baguette</b> : remplace un plat manquant.
        </p>
        <p>
          <b>Annonces</b> : Gastronomique (tes régions) › Maison (avec la Baguette) › Volé (une autre région). Égalité : le plus proche à gauche du porteur de
          la Vaisselle gagne.
        </p>
      </div>
    </Modal>
  );
}
