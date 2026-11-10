/* =========================================================
   Dr. Neto Pereira — motion
   GSAP + ScrollTrigger + Lenis
   ========================================================= */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = root.classList.contains('reduced');
  const hasGSAP = typeof window.gsap !== 'undefined';
  const isTouch = matchMedia('(hover: none)').matches;
  const page = document.body.dataset.page || '';

  const safeSession = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };

  /* ---------------- Sem GSAP / movimento reduzido ---------------- */
  if (!hasGSAP || reduced) {
    $('.loader')?.classList.add('is-skipped');
    root.classList.remove('np-transition', 'np-first');
    safeSession.del('np-transition'); safeSession.set('np-visited', '1');
    $('.wa')?.classList.add('is-in');
    $$('.reveal-up').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
    initCommon(null);
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'expo.out', duration: 1.2 });

  /* ---------------- Smooth scroll ---------------- */
  const lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // Trava de rolagem sem esconder a barra nativa (evita o "pulo" de layout)
  const KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'];
  const block = e => { if (e.type !== 'keydown' || KEYS.includes(e.key)) e.preventDefault(); };
  let locked = false;
  function lockScroll() {
    if (locked) return; locked = true; lenis.stop();
    addEventListener('wheel', block, { passive: false });
    addEventListener('touchmove', block, { passive: false });
    addEventListener('keydown', block);
  }
  function unlockScroll() {
    if (!locked) return; locked = false; lenis.start();
    removeEventListener('wheel', block); removeEventListener('touchmove', block); removeEventListener('keydown', block);
  }
  window.__npScroll = { lock: lockScroll, unlock: unlockScroll };

  initCommon(lenis);

  /* ---------------- Utilidades de split ---------------- */
  function splitWords(el, cls = 'wd') {
    if (el.dataset.splitDone) return $$(`.${cls} > span`, el);
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(p => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const o = document.createElement('span'); o.className = cls;
            o.style.display = 'inline-block'; o.style.overflow = 'hidden'; o.style.verticalAlign = 'top';
            o.style.paddingBottom = '.12em'; o.style.marginBottom = '-.12em';
            const i = document.createElement('span'); i.style.display = 'inline-block'; i.textContent = p;
            o.appendChild(i); frag.appendChild(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    el.dataset.splitDone = '1';
    return $$(`.${cls} > span`, el);
  }
  function splitPlain(el) {
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(p => {
            if (!p) return;
            if (/^\s+$/.test(p)) return frag.appendChild(document.createTextNode(' '));
            const s = document.createElement('span'); s.className = 'w'; s.textContent = p; frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    return $$('.w', el);
  }

  /* ---------------- Entrada: loader ou cortina ---------------- */
  const loader = $('.loader');
  const curtainBars = $$('.curtain i');
  // flags definidos no <head> antes da pintura (evita piscar loader/cortina)
  const cameFromTransition = root.classList.contains('np-transition');
  const firstVisit = root.classList.contains('np-first') && !cameFromTransition;
  safeSession.del('np-transition');
  safeSession.set('np-visited', '1');

  function playEntrance() {
    // 1) Vindo de outra página do site: só a cortina se abre (sem loader)
    if (cameFromTransition) {
      loader?.classList.add('is-skipped');
      gsap.set(curtainBars, { scaleX: 1, transformOrigin: 'right' });
      return gsap.timeline()
        .to(curtainBars, { scaleX: 0, duration: 0.9, stagger: 0.05, ease: 'expo.inOut', onComplete: () => root.classList.remove('np-transition') })
        .add(pageIntro(), '-=0.5');
    }
    // 2) Recarregou ou voltou ao site na mesma sessão: nada cobre a tela, só a entrada do conteúdo
    if (!firstVisit || !loader) {
      loader?.classList.add('is-skipped');
      return pageIntro();
    }
    // 3) Primeira visita: apenas o loader da logo (rolagem bloqueada só aqui)
    lockScroll();
    const pills = $$('.loader__mark .pill', loader);
    const tl = gsap.timeline();
    gsap.set(pills, { scaleX: 0, transformOrigin: (i) => (i % 2 ? '0% 50%' : '100% 50%'), transformBox: 'fill-box' });
    gsap.set('.loader__name, .loader__sub', { yPercent: 120, opacity: 0 });
    tl.to(pills, { scaleX: 1, duration: 1.1, stagger: { each: 0.07, from: 'random' }, ease: 'expo.out' })
      .to('.loader__name', { yPercent: 0, opacity: 1, duration: 1 }, 0.35)
      .to('.loader__sub', { yPercent: 0, opacity: 1, duration: 1 }, 0.5)
      .to('.loader__bar i', { scaleX: 1, duration: 1.3, ease: 'power2.inOut' }, 0.2)
      .to('.loader__mark', { scale: 0.86, duration: 1.2, ease: 'expo.inOut' }, 1.5)
      .to('.loader__inner', { opacity: 0, y: -30, duration: 0.7, ease: 'power2.in' }, 1.7)
      .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.inOut' }, 1.95)
      .add(pageIntro(), 2.35)
      .add(() => loader.classList.add('is-skipped'));
    return tl;
  }

  function pageIntro() {
    const tl = gsap.timeline({ onComplete: () => { unlockScroll(); ScrollTrigger.refresh(); } });
    tl.from('.nav__inner', { yPercent: -60, opacity: 0, duration: 1.2 }, 0.1);
    if (page === 'home') {
      tl.from('.hero__title .line > span', { yPercent: 115, duration: 1.5, stagger: 0.1 }, 0)
        .from('[data-hero-media] img', { scale: 1.18, duration: 2.4, ease: 'expo.out' }, 0)
        .from('[data-hero-fade]', { y: 30, opacity: 0, duration: 1.2, stagger: 0.12 }, 0.35)
        .from('.scroll-cue', { opacity: 0, duration: 1 }, 0.9);
    } else {
      const h = $('[data-page-title]');
      if (h) tl.from(splitWords(h), { yPercent: 115, duration: 1.4, stagger: 0.05 }, 0);
      tl.from('[data-page-fade]', { y: 30, opacity: 0, stagger: 0.1 }, 0.3);
    }
    return tl;
  }

  /* ---------------- Transição entre páginas ---------------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/admin')) return;
    const samePage = url.pathname === location.pathname;
    if (samePage && url.hash) {
      const t = $(url.hash);
      if (t) { e.preventDefault(); closeMenu(); lenis.scrollTo(t, { offset: 0, duration: 1.6 }); history.replaceState(null, '', url.hash); }
      return;
    }
    if (samePage) return;
    e.preventDefault();
    closeMenu();
    safeSession.set('np-transition', '1');
    gsap.set(curtainBars, { transformOrigin: 'left' });
    gsap.to(curtainBars, { scaleX: 1, duration: 0.85, stagger: 0.06, ease: 'expo.inOut', onComplete: () => { location.href = url.href; } });
  });
  window.addEventListener('pageshow', ev => { if (ev.persisted) gsap.set(curtainBars, { scaleX: 0 }); });

  /* ---------------- HOME ---------------- */
  if (page === 'home') {
    const mm = gsap.matchMedia();

    // HERO: foto encolhe para um quadro, título sobe
    gsap.timeline({ scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '+=100%', scrub: 0.6, pin: true, anticipatePin: 1 } })
      .to('[data-hero-media]', { clipPath: 'inset(9% 7% 9% 7% round 44px)', ease: 'none' }, 0)
      .to('[data-hero-media] img', { scale: 0.94, ease: 'none' }, 0)
      .to('[data-hero-content]', { yPercent: -18, opacity: 0, ease: 'none' }, 0)
      .to('.scroll-cue', { opacity: 0, duration: 0.2 }, 0);

    // INTRO: quadro cresce até tela cheia (estilo Apple)
    const frame = $('[data-intro-frame]');
    if (frame) {
      const insetSmall = () => {
        const vw = innerWidth, vh = innerHeight;
        const w = Math.min(vw * (vw < 720 ? 0.62 : 0.3), 420), h = w * 4 / 3;
        return `inset(${(vh - h) / 2}px ${(vw - w) / 2}px ${(vh - h) / 2}px ${(vw - w) / 2}px round 44px)`;
      };
      gsap.set(frame, { clipPath: insetSmall() });
      const tl = gsap.timeline({ scrollTrigger: { trigger: '[data-intro]', start: 'top top', end: '+=180%', scrub: 0.7, pin: '.intro__pin', anticipatePin: 1, invalidateOnRefresh: true } });
      tl.fromTo(frame, { clipPath: insetSmall }, { clipPath: 'inset(0px 0px 0px 0px round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
        .fromTo($('img', frame), { scale: 1.35 }, { scale: 1, ease: 'power2.inOut', duration: 1 }, 0)
        .to('.intro__text', { scale: 0.86, opacity: 0, ease: 'power1.in', duration: 0.55 }, 0.1)
        .to('[data-intro-caption]', { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0.85)
        .from('[data-intro-caption]', { y: 40, duration: 0.35 }, 0.85)
        .to({}, { duration: 0.3 });
    }

    // ESPECIALIDADES: rolagem horizontal
    const track = $('[data-track]');
    if (track) {
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const st = { trigger: '[data-stage]', start: 'center center', end: () => '+=' + (dist() + innerHeight * 0.25), scrub: 0.8, pin: '[data-stage]', anticipatePin: 1, invalidateOnRefresh: true };
      const tween = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: st });
      gsap.to('[data-track-progress]', { scaleX: 1, ease: 'none', scrollTrigger: { ...st, pin: false } });
      $$('.svc', track).forEach((card, i) => {
        gsap.from(card, { yPercent: 18, rotate: i % 2 ? 2 : -2, opacity: 0.2, ease: 'none',
          scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 105%', end: 'left 60%', scrub: true } });
      });
    }

    // PRECISÃO: máscara abre
    const clip = $('[data-clip]');
    if (clip) {
      gsap.timeline({ scrollTrigger: { trigger: clip, start: 'top 85%', end: 'center 50%', scrub: 0.6 } })
        .to(clip, { clipPath: 'inset(0% 0% 0% 0% round 44px)', ease: 'none' }, 0)
        .to($('img', clip), { scale: 1, ease: 'none' }, 0);
      gsap.to('.orb--a', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '[data-precision]', scrub: true } });
      gsap.to('.orb--b', { yPercent: -40, ease: 'none', scrollTrigger: { trigger: '[data-precision]', scrub: true } });
    }

    // TIMELINE
    const tlBox = $('[data-timeline]');
    if (tlBox) {
      gsap.to($('.timeline__line i', tlBox), { scaleY: 1, ease: 'none', scrollTrigger: { trigger: tlBox, start: 'top 70%', end: 'bottom 60%', scrub: true } });
      $$('.tl', tlBox).forEach(item => {
        ScrollTrigger.create({ trigger: item, start: 'top 68%', onToggle: s => item.classList.toggle('is-on', s.isActive || s.progress === 1), onLeave: () => item.classList.add('is-on'), onEnterBack: () => item.classList.add('is-on'), onLeaveBack: () => item.classList.remove('is-on') });
        gsap.from(item, { x: 30, opacity: 0, duration: 1.2, scrollTrigger: { trigger: item, start: 'top 85%' } });
      });
    }

    // QUOTE: parallax
    const qbg = $('[data-quote-bg]');
    if (qbg) gsap.fromTo(qbg, { yPercent: -8, scale: 1.1 }, { yPercent: 8, scale: 1, ease: 'none', scrollTrigger: { trigger: '[data-quote]', start: 'top bottom', end: 'bottom top', scrub: true } });

    // MÍDIA: cartões com leve parallax interno
    mm.add('(min-width: 721px)', () => {
      $$('.mcard img').forEach(img => gsap.fromTo(img, { yPercent: -4, scale: 1.1 }, { yPercent: 4, scale: 1.1, ease: 'none', scrollTrigger: { trigger: img.parentElement, scrub: true } }));
    });

    // posts
    gsap.from('[data-latest] .pcard', { y: 60, opacity: 0, duration: 1.3, stagger: 0.12, scrollTrigger: { trigger: '[data-latest]', start: 'top 85%' } });

    // WhatsApp flutuante após o hero
    ScrollTrigger.create({ trigger: '[data-intro]', start: 'top 50%', onEnter: () => $('.wa')?.classList.add('is-in'), onLeaveBack: () => $('.wa')?.classList.remove('is-in') });
  } else {
    $('.wa')?.classList.add('is-in');
  }

  /* ---------------- Animações globais ---------------- */
  // reveal-up
  ScrollTrigger.batch('.reveal-up', {
    start: 'top 90%',
    onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1.3, stagger: 0.09, overwrite: true }),
  });

  // títulos com split por palavra
  $$('[data-split]').forEach(el => {
    const words = splitWords(el);
    gsap.from(words, { yPercent: 115, duration: 1.3, stagger: 0.035, scrollTrigger: { trigger: el, start: 'top 88%' } });
  });

  // linhas grandes (contato)
  $$('[data-lines]').forEach(el => {
    gsap.from($$('.line > span', el), { yPercent: 110, duration: 1.6, stagger: 0.12, scrollTrigger: { trigger: el, start: 'top 85%' } });
  });

  // palavras acendendo (manifesto)
  $$('[data-words]').forEach(el => {
    const w = splitPlain(el);
    gsap.to(w, { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 45%', scrub: 0.6 } });
  });

  // parallax de imagens
  $$('[data-parallax-img]').forEach(box => {
    const img = $('img', box);
    gsap.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: box, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // empilhamento de seções: a anterior recua quando o painel sobe
  $$('.panel').forEach(panel => {
    const prev = panel.previousElementSibling;
    if (!prev || prev.matches('.quote, [data-hero], [data-intro]') || prev.querySelector('.services__pin, .intro__pin')) return;
    gsap.fromTo(prev, { scale: 1, filter: 'brightness(1)' }, {
      scale: 0.94, filter: 'brightness(0.55)', ease: 'none', transformOrigin: '50% 100%',
      scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top 20%', scrub: true },
    });
  });

  // rodapé: palavra gigante sobe
  const fw = $('.footer__word span');
  if (fw) gsap.from(fw, { yPercent: 60, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top 90%', end: 'bottom bottom', scrub: true } });

  // botões magnéticos
  if (!isTouch) $$('[data-magnetic]').forEach(btn => {
    const xTo = gsap.quickTo(btn, 'x', { duration: 0.6, ease: 'power3' });
    const yTo = gsap.quickTo(btn, 'y', { duration: 0.6, ease: 'power3' });
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.25); yTo((e.clientY - r.top - r.height / 2) * 0.35);
    });
    btn.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
  });

  /* ---------------- BLOG / ARTIGO ---------------- */
  const prog = $('.progress');
  if (prog) {
    const art = $('.article') || document.body;
    gsap.to(prog, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: art, start: 'top top', end: 'bottom bottom', scrub: true } });
  }
  const cover = $('.article-cover img');
  if (cover) gsap.fromTo(cover, { scale: 1.2, yPercent: -4 }, { scale: 1, yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.article-cover', start: 'top bottom', end: 'bottom top', scrub: true } });
  if ($('.article-cover')) gsap.from('.article-cover', { clipPath: 'inset(12% 10% 0% 10% round 44px)', duration: 1.8, ease: 'expo.out', delay: 0.4 });
  $$('.prose figure img').forEach(img => gsap.from(img, { clipPath: 'inset(10% 10% 10% 10% round 22px)', opacity: 0, duration: 1.4, scrollTrigger: { trigger: img, start: 'top 85%' } }));
  $$('.posts--blog .pcard, .featured').forEach(c => gsap.from(c, { y: 50, opacity: 0, duration: 1.2, scrollTrigger: { trigger: c, start: 'top 92%' } }));

  /* ---------------- Start ---------------- */
  const start = () => playEntrance();
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  // fallback de segurança caso alguma imagem demore
  setTimeout(unlockScroll, 6000);
  window.addEventListener('load', () => ScrollTrigger.refresh());

  /* =========================================================
     Funções comuns (rodam com ou sem animação)
     ========================================================= */
  function closeMenu() {
    root.classList.remove('menu-open');
    $('.burger')?.setAttribute('aria-expanded', 'false');
    $('.mobile-menu')?.setAttribute('aria-hidden', 'true');
  }

  function initCommon(lenis) {
    // nav
    const nav = $('#nav');
    let lastY = 0;
    const onScroll = y => {
      nav?.classList.toggle('is-scrolled', y > 40);
      const goingDown = y > lastY && y > 300 && !root.classList.contains('menu-open');
      nav?.classList.toggle('is-hidden', goingDown);
      lastY = y;
    };
    if (lenis) lenis.on('scroll', e => onScroll(e.scroll)); else addEventListener('scroll', () => onScroll(scrollY), { passive: true });

    // destaque do link do blog
    if (location.pathname.startsWith('/blog')) $$('[data-nav="blog"]').forEach(a => a.classList.add('is-active'));

    // menu mobile
    $('.burger')?.addEventListener('click', () => {
      const open = !root.classList.contains('menu-open');
      root.classList.toggle('menu-open', open);
      $('.burger').setAttribute('aria-expanded', String(open));
      $('.mobile-menu').setAttribute('aria-hidden', String(!open));
      if (lenis) open ? window.__npScroll?.lock() : window.__npScroll?.unlock();
    });
    $$('.mobile-menu a').forEach(a => a.addEventListener('click', () => { closeMenu(); window.__npScroll?.unlock(); }));

    // acordeão
    $$('[data-acc] .acc__item').forEach(item => {
      const btn = $('.acc__q', item), panel = $('.acc__a', item);
      btn.addEventListener('click', () => {
        const open = !item.classList.contains('is-open');
        $$('[data-acc] .acc__item.is-open').forEach(o => {
          if (o === item) return;
          o.classList.remove('is-open'); $('.acc__q', o).setAttribute('aria-expanded', 'false');
          animateHeight($('.acc__a', o), 0);
        });
        item.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        animateHeight(panel, open ? panel.scrollHeight : 0);
      });
    });
    function animateHeight(el, h) {
      if (window.gsap && !reduced) gsap.to(el, { height: h, duration: 0.8, ease: 'expo.out', onComplete: () => window.ScrollTrigger?.refresh() });
      else el.style.height = h ? 'auto' : '0px';
    }

    // formulário -> WhatsApp
    $('[data-contact-form]')?.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const txt = `Olá! Meu nome é ${f.get('nome')}.${f.get('telefone') ? ' Telefone: ' + f.get('telefone') + '.' : ''}\n\n${f.get('mensagem')}`;
      window.open('https://wa.me/5537988252119?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    });

    // blog: filtros e busca
    const list = $('[data-post-list]');
    if (list) {
      const cards = $$('[data-post]', list);
      const empty = $('[data-empty]');
      let cat = 'todos', q = '';
      const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const apply = () => {
        let shown = 0;
        cards.forEach(c => {
          const okCat = cat === 'todos' || (c.dataset.cats || '').split('|').includes(cat);
          const okQ = !q || norm(c.dataset.search).includes(q);
          const on = okCat && okQ;
          c.style.display = on ? '' : 'none';
          if (on) shown++;
        });
        if (empty) empty.style.display = shown ? 'none' : '';
        window.ScrollTrigger?.refresh();
      };
      $$('[data-filter]').forEach(b => b.addEventListener('click', () => {
        $$('[data-filter]').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active'); cat = b.dataset.filter; apply();
      }));
      $('[data-search]')?.addEventListener('input', e => { q = norm(e.target.value.trim()); apply(); });
    }

    // copiar link
    $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); b.setAttribute('title', 'Link copiado!'); b.style.background = 'var(--ink)'; b.style.color = 'var(--ivory)'; } catch {}
    }));
  }
})();
