// Règles du jeu, en moins de 150 mots.
import { Modal } from './Modal';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Règles de BOULET !" onClose={onClose}>
      <div className="rules">
        <p>
          <b>But :</b> vider ta main. Quand quelqu’un atteint 300 points, le score le plus <b>bas</b> gagne.
        </p>
        <p>Pose une carte de même <b>couleur</b> ou de même <b>valeur</b>. Le Joker va sur tout.</p>
        <p>
          <b>Double :</b> 2 cartes de même valeur d’un coup. La 2e donne la couleur. Une action en double compte 2 fois.
        </p>
        <p>Sinon, pioche 1 carte : pose-la si elle va.</p>
        <p>
          <b>+2</b> : le suivant pioche 2 et passe. <b>Inversion</b> : change de sens (à 2, tu rejoues). <b>Passe</b> : le suivant saute
          son tour.
        </p>
        <p>
          <b>Le BOULET</b> ne se pose jamais. Pour t’en débarrasser, pose un double et refile-le à qui tu veux ! Impossible de finir avec
          le Boulet.
        </p>
        <p>
          <b>Points :</b> chiffre = sa valeur, action = 20, Joker et Boulet = 50.
        </p>
        <p>Qui garde le Boulet recommence avec, joue en premier et donne ses 2 meilleures cartes au gagnant, qui lui en rend 2.</p>
      </div>
    </Modal>
  );
}
