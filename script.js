/* ======================================================================
   ONLY — Strategic Branding Agency
   Vanilla JS only — no external dependencies.
   ====================================================================== */
(() => {
  'use strict';

  /* ---------- Load-in animations ---------- */
  window.addEventListener('load', () => {
    document.querySelectorAll('.anim').forEach((el) => el.classList.add('loaded'));
  });

  /* ---------- Scroll-reveal (IntersectionObserver) ---------- */
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    revealTargets.forEach((el) => revealObserver.observe(el));
  } else {
    // Fallback: no IO support — just show everything
    revealTargets.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Navbar: glass on scroll ---------- */
  const nav = document.getElementById('siteNav');
  const onNavScroll = () => {
    if (window.scrollY > 40) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onNavScroll();
  window.addEventListener('scroll', onNavScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('navMobile');
  burger.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });
  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Custom cursor (fine pointer only) ---------- */
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;
  const cursorDot = document.getElementById('cursorDot');

  if (isFinePointer && cursorDot) {
    let mouseX = 0, mouseY = 0, dotX = 0, dotY = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    function animateCursor() {
      // simple lerp for a soft trailing feel
      dotX += (mouseX - dotX) * 0.35;
      dotY += (mouseY - dotY) * 0.35;
      cursorDot.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`;
      requestAnimationFrame(animateCursor);
    }
    requestAnimationFrame(animateCursor);

    document.querySelectorAll('a, button').forEach((el) => {
      el.addEventListener('mouseenter', () => cursorDot.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursorDot.classList.remove('is-hover'));
    });
  } else if (cursorDot) {
    cursorDot.style.display = 'none';
  }

  /* ---------- Work list: floating preview follows cursor ---------- */
  const workList = document.getElementById('workList');
  const workPreview = document.getElementById('workPreview');

  if (workList && workPreview && isFinePointer) {
    let previewX = 0, previewY = 0, targetX = 0, targetY = 0;
    let previewActive = false;

    document.addEventListener('mousemove', (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    });

    function animatePreview() {
      previewX += (targetX - previewX) * 0.18;
      previewY += (targetY - previewY) * 0.18;
      workPreview.style.left = `${previewX}px`;
      workPreview.style.top = `${previewY}px`;
      requestAnimationFrame(animatePreview);
    }
    requestAnimationFrame(animatePreview);

    workList.querySelectorAll('.work__row').forEach((row) => {
      row.addEventListener('mouseenter', () => {
        const bgClass = row.getAttribute('data-bg');
        workPreview.className = 'work__preview'; // reset
        if (bgClass) workPreview.classList.add(bgClass);
        workPreview.classList.add('is-active');
        previewActive = true;
      });
      row.addEventListener('mouseleave', () => {
        workPreview.classList.remove('is-active');
        previewActive = false;
      });
    });
  }

  /* ---------- Animated counters (About stats) ---------- */
  const counters = document.querySelectorAll('.stat__num');
  if (counters.length && 'IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target, parseInt(entry.target.dataset.count, 10));
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((el) => counterObserver.observe(el));
  }

  function animateCounter(el, target, duration = 1600) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      el.textContent = Math.floor(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Footer year + back to top ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
