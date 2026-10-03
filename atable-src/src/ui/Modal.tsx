// Fenêtre modale simple, plein écran sur mobile.
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function Modal({ open, title, children, onClose }: { open: boolean; title?: string; children: ReactNode; onClose?: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && <h2>{title}</h2>}
            {children}
            {onClose && (
              <button className="modal-close" onClick={onClose} aria-label="Fermer">
                ✕
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
