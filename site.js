/* =====================================================
   Site pro : formulaire de devis + raccourcis services
   ===================================================== */
(() => {
  const form = document.getElementById('quoteForm');
  if (!form) return;
  const select = document.getElementById('projetSelect');
  const status = document.getElementById('formStatus');

  // "Demander un devis" on a service card preselects that service
  document.querySelectorAll('[data-service]').forEach(link => {
    link.addEventListener('click', () => {
      const wanted = link.dataset.service;
      const opt = [...select.options].find(o => o.text === wanted);
      if (opt) select.value = opt.value || opt.text;
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let firstBad = null;
    form.querySelectorAll('[required]').forEach(el => {
      const ok = el.type === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()) : el.value.trim() !== '';
      el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !firstBad) firstBad = el;
    });
    if (firstBad){
      status.textContent = 'Merci de compléter les champs indiqués en rouge.';
      firstBad.focus();
      return;
    }

    const d = Object.fromEntries(new FormData(form));
    // No form backend yet: open the visitor's mail app with the request prefilled.
    const subject = `Demande de devis : ${d.projet} (${d.nom})`;
    const body = [
      `Nom : ${d.nom}`,
      `E-mail : ${d.email}`,
      d.telephone ? `Téléphone : ${d.telephone}` : null,
      `Type de projet : ${d.projet}`,
      `Budget indicatif : ${d.budget}`,
      `Délai souhaité : ${d.delai}`,
      '',
      d.message
    ].filter(l => l !== null).join('\n');
    window.location.href = `mailto:gaudinmister@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Votre messagerie s\'ouvre avec votre demande prête à envoyer. Si rien ne s\'ouvre, écrivez-moi à gaudinmister@gmail.com.';
  });
})();

/* =====================================================
   Études de cas : carrousel + fenêtre détaillée
   ===================================================== */
(() => {
  const track = document.getElementById('caseTrack');
  if (!track) return;
  const btns = document.querySelectorAll('.carousel-btn');

  const step = () => {
    const card = track.querySelector('.case-card');
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
  };
  const cards = [...track.querySelectorAll('.case-card')];
  const dotsBox = document.getElementById('caseDots');
  const dots = cards.map(() => dotsBox.appendChild(document.createElement('span')));
  const carousel = track.parentElement;

  const sync = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    btns.forEach(b => { b.disabled = +b.dataset.dir < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max; });
    // Chevrons sit at the vertical middle of the card images
    const media = cards[0] && cards[0].querySelector('.case-media');
    if (media) carousel.style.setProperty('--media-mid', (media.offsetTop + media.offsetHeight / 2 + track.offsetTop) + 'px');
    // Active dot = first card fully in view
    const first = Math.round(track.scrollLeft / step());
    const visible = Math.max(1, Math.round(track.clientWidth / step()));
    dots.forEach((d, i) => d.classList.toggle('on', i >= first && i < first + visible));
  };
  btns.forEach(b => b.addEventListener('click', () => track.scrollBy({ left: +b.dataset.dir * step(), behavior: 'smooth' })));
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  sync();

  const modal = document.getElementById('caseModal');
  const body = document.getElementById('caseModalBody');
  if (!modal || typeof modal.showModal !== 'function') return;
  let opener = null;

  const close = () => modal.close();
  modal.addEventListener('close', () => {
    document.documentElement.classList.remove('modal-open');
    body.innerHTML = '';
    if (opener) opener.focus();
  });
  modal.querySelector('.case-modal-close').addEventListener('click', close);
  // Click on the dimmed backdrop (outside the panel) closes it
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  document.querySelectorAll('.case-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const src = document.getElementById('case-' + btn.dataset.case);
      if (!src) return;
      opener = btn;
      body.innerHTML = src.innerHTML;
      body.scrollTop = 0;
      document.documentElement.classList.add('modal-open');
      modal.showModal();
      modal.querySelector('.case-modal-close').focus();
    });
  });
})();
