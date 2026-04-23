/* =====================================================
   Tweak defaults (persisted by host)
   ===================================================== */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "auraIntensity": 42,
  "grain": 11,
  "cursorOrb": "on",
  "palette": "sunset"
}/*EDITMODE-END*/;
let tweaks = { ...TWEAK_DEFAULTS };

/* =====================================================
   1. Holographic aura - cursor follow + parallax blobs
   ===================================================== */
(() => {
  const orb   = document.getElementById('auraCursor');
  const blobs = [...document.querySelectorAll('.aura-blob')];
  let tx=0, ty=0, cx=window.innerWidth/2, cy=window.innerHeight/2;

  function lerp(a,b,t){ return a+(b-a)*t; }

  window.addEventListener('pointermove', (e)=>{
    tx = e.clientX; ty = e.clientY;
  });
  // gentle auto-drift when idle
  let idle = 0, lastMove = Date.now();
  window.addEventListener('pointermove', ()=> lastMove = Date.now());

  function frame(){
    cx = lerp(cx, tx, .08);
    cy = lerp(cy, ty, .08);
    orb.style.left = cx + 'px';
    orb.style.top  = cy + 'px';

    // parallax - each blob drifts at different rate
    blobs.forEach((b, i) => {
      const k = (i + 1) * .012;
      const offX = (cx - window.innerWidth/2)  * k;
      const offY = (cy - window.innerHeight/2) * k;
      b.style.transform = `translate3d(${offX}px, ${offY}px, 0)`;
    });
    requestAnimationFrame(frame);
  }
  frame();
})();

/* =====================================================
   2. Organic blob clip paths - per-card unique + hover
   ===================================================== */
/* A collection of hand-tuned organic blob shapes (SVG path data, 0–1 coords).
   Each entry has a "rest" and a "morph" path used to animate on hover. */
const BLOBS = {
  a: {
    rest:  "M0.50,0.02 C0.72,0.03 0.95,0.12 0.98,0.34 C1.02,0.55 0.90,0.80 0.72,0.92 C0.54,1.04 0.30,1.02 0.14,0.88 C-0.02,0.74 -0.03,0.50 0.06,0.32 C0.15,0.14 0.34,0.02 0.50,0.02 Z",
    morph: "M0.55,0.04 C0.78,0.08 0.96,0.22 0.95,0.44 C0.94,0.66 0.82,0.85 0.62,0.95 C0.42,1.05 0.20,0.98 0.08,0.80 C-0.04,0.62 0.02,0.38 0.14,0.22 C0.26,0.06 0.40,0.02 0.55,0.04 Z"
  },
  b: {
    rest:  "M0.20,0.06 C0.42,-0.02 0.70,0.02 0.86,0.18 C1.02,0.34 1.02,0.62 0.88,0.80 C0.74,0.98 0.46,1.04 0.26,0.94 C0.06,0.84 -0.04,0.58 0.02,0.36 C0.06,0.20 0.10,0.10 0.20,0.06 Z",
    morph: "M0.16,0.12 C0.38,0.02 0.66,-0.02 0.84,0.14 C1.02,0.30 1.00,0.56 0.92,0.76 C0.84,0.96 0.56,1.06 0.32,0.98 C0.08,0.90 -0.02,0.62 0.00,0.40 C0.02,0.24 0.08,0.16 0.16,0.12 Z"
  },
  c: {
    rest:  "M0.48,0.00 C0.68,0.02 0.88,0.18 0.96,0.40 C1.04,0.62 0.90,0.86 0.66,0.94 C0.42,1.02 0.18,0.94 0.08,0.74 C-0.02,0.54 0.02,0.28 0.20,0.14 C0.30,0.06 0.38,0.00 0.48,0.00 Z",
    morph: "M0.44,0.04 C0.66,0.00 0.90,0.14 0.94,0.38 C0.98,0.62 0.86,0.88 0.60,0.96 C0.34,1.04 0.10,0.90 0.04,0.66 C-0.02,0.42 0.10,0.18 0.28,0.10 C0.34,0.06 0.40,0.04 0.44,0.04 Z"
  },
  d: {
    rest:  "M0.30,0.02 C0.58,-0.04 0.90,0.08 0.96,0.32 C1.02,0.56 0.84,0.82 0.60,0.94 C0.36,1.06 0.08,0.98 0.02,0.72 C-0.04,0.46 0.06,0.20 0.22,0.10 C0.26,0.06 0.28,0.02 0.30,0.02 Z",
    morph: "M0.34,0.06 C0.62,0.00 0.94,0.16 0.94,0.40 C0.94,0.64 0.76,0.90 0.50,0.96 C0.24,1.02 -0.02,0.88 -0.02,0.62 C-0.02,0.36 0.14,0.14 0.28,0.08 C0.32,0.06 0.34,0.06 0.34,0.06 Z"
  },
  e: {
    rest:  "M0.52,0.04 C0.80,0.00 0.96,0.28 0.94,0.50 C0.92,0.72 0.76,0.96 0.48,0.96 C0.20,0.96 0.00,0.72 0.04,0.44 C0.08,0.16 0.28,0.08 0.52,0.04 Z",
    morph: "M0.48,0.08 C0.76,0.04 0.98,0.22 0.92,0.52 C0.86,0.82 0.60,0.98 0.36,0.94 C0.12,0.90 -0.02,0.68 0.02,0.44 C0.06,0.20 0.28,0.10 0.48,0.08 Z"
  },
  f: {
    rest:  "M0.24,0.08 C0.46,-0.02 0.78,0.04 0.92,0.22 C1.06,0.40 0.96,0.70 0.80,0.86 C0.64,1.02 0.34,1.02 0.18,0.88 C0.02,0.74 -0.04,0.42 0.08,0.22 C0.14,0.14 0.20,0.10 0.24,0.08 Z",
    morph: "M0.20,0.14 C0.42,0.04 0.78,0.10 0.88,0.30 C0.98,0.50 0.90,0.76 0.72,0.90 C0.54,1.04 0.28,1.00 0.14,0.86 C0.00,0.72 -0.02,0.46 0.08,0.26 C0.12,0.18 0.18,0.16 0.20,0.14 Z"
  }
};

/* Build SVG clipPath defs with SVG <animate> for continuous, seamless morph.
   Each mask loops through several keyframe blob paths so no corner pops.
   Hover does NOT change the shape. */
(() => {
  const defsSvg = document.querySelector('svg defs');
  const keys = Object.keys(BLOBS);
  let counter = 0;

  document.querySelectorAll('.fluid-mask').forEach((el) => {
    const startKey = el.dataset.morph || 'a';
    // Build a unique cycle: start -> 2 others -> back to start so it loops seamlessly
    const others = keys.filter(k => k !== startKey);
    // shuffle-ish by counter
    const shuffled = [others[counter % others.length], others[(counter + 2) % others.length], others[(counter + 3) % others.length]];
    const cycle = [startKey, ...shuffled, startKey];
    const values = cycle.map(k => BLOBS[k].rest).join(';');
    // slow, staggered per mask for organic variety
    const dur = (14 + (counter % 5) * 2) + 's';
    const begin = (-(counter % 7) * 1.3) + 's';
    const cpId = `cp-${counter}`;
    counter++;

    defsSvg.insertAdjacentHTML('beforeend', `
      <clipPath id="${cpId}" clipPathUnits="objectBoundingBox">
        <path d="${BLOBS[startKey].rest}">
          <animate attributeName="d" dur="${dur}" begin="${begin}" repeatCount="indefinite"
                   calcMode="spline"
                   keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
                   keyTimes="0; 0.33; 0.66; 0.85; 1"
                   values="${values}"/>
        </path>
      </clipPath>
    `);

    el.style.setProperty('--cp', `url(#${cpId})`);
    el.style.setProperty('--cp-hover', `url(#${cpId})`); // same - no hover change

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 100;
      const my = ((e.clientY - r.top)  / r.height) * 100;
      el.querySelector('.inner').style.setProperty('--mx', mx + '%');
      el.querySelector('.inner').style.setProperty('--my', my + '%');
    });
  });
})();

/* =====================================================
   3. Scroll reveal
   ===================================================== */
(() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

/* =====================================================
   3b. Lightbox - click image to enlarge, × / Esc to close
   ===================================================== */
(() => {
  const lb          = document.getElementById('lightbox');
  const lbInner     = document.getElementById('lbInner');
  const lbPlaceholder = document.getElementById('lbPlaceholder');
  const lbTitle     = document.getElementById('lbTitle');
  const lbKind      = document.getElementById('lbKind');
  const closeBtn    = document.getElementById('lbClose');
  let lastFocus = null;

  const TOOL_LABEL = {
    photoshop: ['Ps','Photoshop'], illustrator: ['Ai','Illustrator'], indesign: ['Id','InDesign'],
    lightroom: ['Lr','Lightroom'], premiere: ['Pr','Premiere Pro'], davinci: ['Dv','DaVinci Resolve'],
    dimension: ['Dn','Dimension'], creative_cloud: ['Cc','Creative Cloud'], claude: ['Cl','Claude'], figma: ['F','Figma'], framer: ['Fr','Framer'], vscode: ['<>','VS Code']
  };
  function toolChip(t){
    const [g, name] = TOOL_LABEL[t] || [t[0].toUpperCase(), t];
    const hasSvg = ['photoshop', 'illustrator', 'indesign', 'lightroom', 'figma', 'premiere', 'creative_cloud'].includes(t);
    const glyphHtml = hasSvg ? `<img loading="lazy" decoding="async" src="assets/Icons/${t}.svg" style="width:24px;height:24px;" alt="${name}">` : `<span class="glyph">${g}</span>`;
    return `<span class="tool-chip" data-t="${t}">${glyphHtml}${name}</span>`;
  }

  function openFor(el){
    lastFocus = document.activeElement;
    lbTitle.textContent = el.dataset.lbTitle || 'Projet';
    lbKind.textContent  = el.dataset.lbKind  || '-';

    // Tint the lightbox background to match the source tile
    const cs = getComputedStyle(el);
    const a = cs.getPropertyValue('--tint-a').trim() || 'var(--lilac)';
    const b = cs.getPropertyValue('--tint-b').trim() || 'var(--sky)';
    lbInner.style.background =
      `radial-gradient(circle at 30% 30%, oklch(0.85 0.12 320 / .8), transparent 55%),` +
      `linear-gradient(135deg, ${a}, ${b})`;

    // Build the gallery - multiple images of the same subject
    const gallery = document.getElementById('lbGallery');
    let items = [];
    try { items = JSON.parse((el.dataset.gallery || '[]').replace(/&#39;/g, "'")); } catch(e){}
    if (!items.length) {
      const ph = el.querySelector('.placeholder');
      const base = ph ? ph.textContent.trim() : 'Image';
      items = [
        { label: base, caption: 'vue principale' },
        { label: base + ' · détail', caption: 'gros plan' },
        { label: base + ' · contexte', caption: 'mise en scène' },
        { label: base + ' · variation', caption: 'déclinaison' }
      ];
    }
    const hues = [320, 20, 240, 165, 62, 280];
    gallery.innerHTML = items.map((it, i) => {
      const h  = hues[i % hues.length];
      const h2 = hues[(i + 2) % hues.length];
      const imgHtml = it.img ? `<img src="${it.img}" alt="${(it.label || '').replace(/"/g,'&quot;')}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">` : '';
      return `<div class="lb-slide" data-idx="${i}" style="--h:${h}; --h2:${h2}">
        ${imgHtml}
        <div class="cap"><span>${String(i+1).padStart(2,'0')} / ${String(items.length).padStart(2,'0')}</span><span>${it.caption || it.label || ''}</span></div>
      </div>`;
    }).join('');
    // Store items globally for the fullscreen viewer
    window.__lbItems = items;
    // Wire fullscreen clicks on each slide
    gallery.querySelectorAll('.lb-slide').forEach(s => {
      s.style.cursor = 'zoom-in';
      s.addEventListener('click', (ev) => { ev.stopPropagation(); openFullscreen(+s.dataset.idx); });
      const im = s.querySelector('img');
      if (im){
        const classify = () => {
          const r = im.naturalWidth / im.naturalHeight;
          let ratio = 'square';
          if (r > 1.7) ratio = 'wide';
          else if (r > 1.15) ratio = 'landscape';
          else if (r < 0.85) ratio = 'portrait';
          s.setAttribute('data-ratio', ratio);
        };
        if (im.complete && im.naturalWidth) classify();
        else im.addEventListener('load', classify);
      }
    });

    // Tools badges
    const tools = (el.dataset.tools || '').split(',').filter(Boolean);
    const tBar = document.getElementById('lbTools');
    tBar.innerHTML = tools.map(toolChip).join('');

    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }
  function close(){
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  // For photography & illustration tiles: open the clicked image fullscreen,
  // but make the whole gallery (all sibling tiles in the same section)
  // navigable via prev/next arrows.
  function openSingleFullscreen(el){
    let items;
    let idx = 0;
    if (el.classList.contains('fs-direct')) {
      const im = el.querySelector('.inner img');
      items = [{
        label: el.dataset.lbTitle || el.querySelector('.placeholder')?.textContent.trim() || '',
        caption: el.dataset.lbKind || '',
        img: im ? im.getAttribute('src') : null
      }].filter(it => it.img);
    } else {
      // Collect all sibling fluid-masks in the same gallery container
      const container = el.closest('.gallery') || el.parentElement;
      const siblings = [...container.querySelectorAll(':scope > .fluid-mask')];
      items = siblings.map(s => {
        const im = s.querySelector('.inner img');
        return {
          label: s.dataset.lbTitle || s.querySelector('.placeholder')?.textContent.trim() || '',
          caption: s.dataset.lbKind || '',
          img: im ? im.getAttribute('src') : null
        };
      }).filter(it => it.img);
      idx = Math.max(0, siblings.indexOf(el));
    }
    window.__lbItems = items;
    const fs = document.getElementById('lbFs');
    // Show prev/next arrows only if more than one image
    const showNav = items.length > 1;
    document.getElementById('lbFsPrev').style.display = showNav ? '' : 'none';
    document.getElementById('lbFsNext').style.display = showNav ? '' : 'none';
    openFullscreen(idx);
    document.body.style.overflow = 'hidden';
  }

  document.querySelectorAll('.fluid-mask').forEach(el => {
    el.style.cursor = 'zoom-in';
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    const isPhoto = !!el.closest('#photo');
    const isIllustration = !!el.closest('#illustration');
    const isDirect = el.classList.contains('fs-direct');
    const handler = () => {
      if (isPhoto || isIllustration || isDirect) openSingleFullscreen(el);
      else openFor(el);
    };
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });

  closeBtn.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lb.classList.contains('open')) {
      const fs = document.getElementById('lbFs');
      if (fs.classList.contains('open')) return; // let fs handler close itself
      close();
    }
  });
  document.getElementById('lbFsPrev')?.addEventListener('click', (e) => { e.stopPropagation(); const items = window.__lbItems || []; if (!items.length) return; const fs = document.getElementById('lbFs'); let idx = (+fs.dataset.idx - 1 + items.length) % items.length; openFullscreen(idx); });
  document.getElementById('lbFsNext')?.addEventListener('click', (e) => { e.stopPropagation(); const items = window.__lbItems || []; if (!items.length) return; const fs = document.getElementById('lbFs'); let idx = (+fs.dataset.idx + 1) % items.length; openFullscreen(idx); });
  document.querySelector('.zoom-fs-close')?.addEventListener('click', closeFullscreen);
  // Click outside image closes
  document.getElementById('lbFs')?.addEventListener('click', (e) => {
    if (e.target.id === 'lbFs' || e.target.classList.contains('lb-fs-stage')) closeFullscreen();
  });
  function openFullscreen(idx){
    const items = window.__lbItems || [];
    if (!items[idx]) return;
    const fs = document.getElementById('lbFs');
    const img = fs.querySelector('img');
    const vid = document.getElementById('lbFsVideo');
    const cap = fs.querySelector('.fs-cap');
    const it = items[idx];
    
    if (vid) { vid.src = ''; vid.style.display = 'none'; }
    img.style.display = 'none';
    
    if (it.youtube) {
      if (vid) {
        vid.src = `https://www.youtube-nocookie.com/embed/${it.youtube}?autoplay=1`;
        vid.style.display = 'block';
      }
    } else if (it.img) {
      img.src = it.img; img.alt = it.label || ''; img.style.display = 'block';
    }
    
    cap.innerHTML = `<strong>${it.label || ''}</strong><span>${it.caption || ''}</span>`;
    // Show prev/next arrows for multi-image gallery
    document.getElementById('lbFsPrev').style.display = items.length > 1 ? '' : 'none';
    document.getElementById('lbFsNext').style.display = items.length > 1 ? '' : 'none';
    fs.classList.add('open');
    fs.dataset.idx = idx;
  }
  function closeFullscreen(){
    document.getElementById('lbFs').classList.remove('open');
    const vid = document.getElementById('lbFsVideo');
    if (vid) vid.src = '';
    // Restore body scroll if the main lightbox isn't open underneath
    if (!lb.classList.contains('open')) document.body.style.overflow = '';
  }
  window.addEventListener('keydown', (e) => {
    const fs = document.getElementById('lbFs');
    if (!fs.classList.contains('open')) return;
    if (e.key === 'Escape') closeFullscreen();
    const items = window.__lbItems || [];
    if (!items.length) return;
    let idx = +fs.dataset.idx;
    if (e.key === 'ArrowRight'){ idx = (idx + 1) % items.length; openFullscreen(idx); }
    if (e.key === 'ArrowLeft'){  idx = (idx - 1 + items.length) % items.length; openFullscreen(idx); }
  });

  /* Swipe gesture support for mobile (Galaxy S24, iPhone 14, iPhone 15...) */
  (() => {
    const fs = document.getElementById('lbFs');
    if (!fs) return;
    let startX = 0, startY = 0, tracking = false;
    fs.addEventListener('touchstart', (e) => {
      if (!fs.classList.contains('open')) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; tracking = true;
    }, { passive: true });
    fs.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // horizontal swipe wins only if it's clearly horizontal AND long enough
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const items = window.__lbItems || [];
        if (items.length < 2) return;
        let idx = +fs.dataset.idx;
        idx = dx < 0 ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        openFullscreen(idx);
      }
    }, { passive: true });
  })();
})();


/* =====================================================
   3d. Tools-used chips hydration
   ===================================================== */
(() => {
  const TOOL_LABEL = {
    photoshop: ['Ps','Photoshop'], illustrator: ['Ai','Illustrator'], indesign: ['Id','InDesign'],
    lightroom: ['Lr','Lightroom'], premiere: ['Pr','Premiere Pro'], davinci: ['Dv','DaVinci Resolve'],
    dimension: ['Dn','Dimension'], figma: ['F','Figma'], framer: ['Fr','Framer'], vscode: ['<>','VS Code']
  };
  document.querySelectorAll('.tools-used[data-tools]').forEach(el => {
    const tools = el.dataset.tools.split(',').map(s => s.trim()).filter(Boolean);
    el.innerHTML = tools.map(t => {
      const [g, name] = TOOL_LABEL[t] || [t[0].toUpperCase(), t];
      const hasSvg = ['photoshop', 'illustrator', 'indesign', 'lightroom', 'figma', 'premiere', 'creative_cloud'].includes(t);
      const glyphHtml = hasSvg ? `<img loading="lazy" decoding="async" src="assets/Icons/${t}.svg" style="width:24px;height:24px;" alt="${name}">` : `<span class="glyph">${g}</span>`;
      return `<span class="tool-chip" data-t="${t}">${glyphHtml}${name}</span>`;
    }).join('');
  });
})();

/* =====================================================
   3c. Intro curtain - fade out after animations play
   ===================================================== */
(() => {
  const intro = document.getElementById('intro');
  const body  = document.body;
  // If user comes back via in-page anchor reload, keep it fast
  const skip = sessionStorage.getItem('mg-intro-seen') === '1';
  if (skip) {
    intro.classList.add('done');
    setTimeout(() => intro.remove(), 50);
    body.classList.add('ready');
  } else {
    // Let word animations play, then lift the curtain and cascade reveals
    window.addEventListener('load', () => {
      setTimeout(() => {
        intro.classList.add('done');
        body.classList.add('ready');
        sessionStorage.setItem('mg-intro-seen', '1');
        setTimeout(() => intro.remove(), 1200);
      }, 1700);
    });
  }
})();

/* =====================================================
   4. Tweaks panel - listen BEFORE announce
   ===================================================== */
(() => {
  const panel = document.getElementById('tweaks');
  const root  = document.documentElement;

  const PALETTES = {
    aura:   { l: 'oklch(0.83 0.09 310)', r: 'oklch(0.84 0.10 18)',  s: 'oklch(0.84 0.08 240)', p: 'oklch(0.90 0.09 62)', m: 'oklch(0.89 0.07 165)' },
    sunset: { l: 'oklch(0.72 0.16 340)', r: 'oklch(0.82 0.14 20)',  s: 'oklch(0.80 0.14 50)',  p: 'oklch(0.88 0.12 40)', m: 'oklch(0.82 0.12 70)'  },
    forest: { l: 'oklch(0.80 0.07 260)', r: 'oklch(0.78 0.10 150)', s: 'oklch(0.84 0.08 200)', p: 'oklch(0.86 0.08 155)', m: 'oklch(0.82 0.08 130)' },
    mono:   { l: 'oklch(0.88 0.01 280)', r: 'oklch(0.82 0.01 280)', s: 'oklch(0.70 0.01 280)', p: 'oklch(0.92 0.01 280)', m: 'oklch(0.78 0.01 280)' }
  };

  function apply(){
    // aura intensity
    document.querySelectorAll('.aura-blob').forEach(b => b.style.opacity = tweaks.auraIntensity/100);
    document.getElementById('auraCursor').style.opacity = tweaks.cursorOrb === 'on' ? 1 : 0;
    document.querySelector('.grain').style.opacity = tweaks.grain/100;
    const P = PALETTES[tweaks.palette] || PALETTES.aura;
    root.style.setProperty('--lilac', P.l);
    root.style.setProperty('--rose',  P.r);
    root.style.setProperty('--sky',   P.s);
    root.style.setProperty('--peach', P.p);
    root.style.setProperty('--mint',  P.m);
    document.getElementById('twkAura').value   = tweaks.auraIntensity;
    document.getElementById('twkGrain').value  = tweaks.grain;
    document.getElementById('twkCursor').value = tweaks.cursorOrb;
    document.querySelectorAll('#twkPalette button').forEach(b => {
      b.classList.toggle('active', b.dataset.p === tweaks.palette);
    });
  }

  function update(edits){
    tweaks = { ...tweaks, ...edits };
    apply();
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*'); } catch(e){}
  }

  // Controls
  document.getElementById('twkAura').addEventListener('input', e => update({ auraIntensity: +e.target.value }));
  document.getElementById('twkGrain').addEventListener('input', e => update({ grain: +e.target.value }));
  document.getElementById('twkCursor').addEventListener('change', e => update({ cursorOrb: e.target.value }));
  document.querySelectorAll('#twkPalette button').forEach(b =>
    b.addEventListener('click', () => update({ palette: b.dataset.p }))
  );

  // Host protocol
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === '__activate_edit_mode')   panel.classList.add('show');
    if (d.type === '__deactivate_edit_mode') panel.classList.remove('show');
  });
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch(e){}

  apply();
})();

/* =====================================================
   Back to top button
   ===================================================== */
(() => {
  const btt = document.getElementById('backToTop');
  if (!btt) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
      btt.classList.add('visible');
    } else {
      btt.classList.remove('visible');
    }
  });
  btt.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* =====================================================
   Mobile burger nav
   ===================================================== */
(() => {
  const burger = document.getElementById('burger');
  const drawer = document.getElementById('mobileNav');
  if (!burger || !drawer) return;

  const open = () => {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Fermer le menu');
    document.body.classList.add('no-scroll');
  };
  const close = () => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Ouvrir le menu');
    document.body.classList.remove('no-scroll');
  };
  const toggle = () => {
    if (drawer.classList.contains('open')) close();
    else open();
  };

  burger.addEventListener('click', toggle);
  drawer.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', close);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });
  // Close if viewport grows past mobile breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth > 800 && drawer.classList.contains('open')) close();
  });
})();
