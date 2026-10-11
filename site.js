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
