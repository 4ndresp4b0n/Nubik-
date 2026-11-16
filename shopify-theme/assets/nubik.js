/* NUBIK — interacciones del tema de Shopify (sin dependencias). */
(function () {
  'use strict';
  var N = window.NUBIK || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- aviso flotante ---------- */
  var toastTimer;
  function toast(msg, withCart) {
    var t = $('#toast'); if (!t) return;
    t.innerHTML = '';
    var s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
    if (withCart) { var a = document.createElement('a'); a.href = N.cartUrl || '/cart'; a.textContent = 'Ver carrito'; t.appendChild(a); }
    t.classList.add('is-on'); clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 3600);
  }

  /* ---------- contador del carrito ---------- */
  function setBadge(n, bump) {
    var b = $('#badge'); if (!b) return;
    b.textContent = n; b.classList.toggle('is-on', n > 0);
    if (b.parentElement) b.parentElement.setAttribute('aria-label', n ? 'Ver carrito, ' + n + ' producto' + (n > 1 ? 's' : '') : 'Ver carrito, vacío');
    if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }

  /* ---------- añadir al carrito sin recargar ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.matches || !f.matches('[data-add-form]') || !window.fetch) return;
    e.preventDefault();
    var btn = f.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    fetch((N.cartAddUrl || '/cart/add') + '.js', {
      method: 'POST', headers: { 'Accept': 'application/json' }, body: new FormData(f)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d && (res.d.description || res.d.message) || 'No pudimos añadir el producto.');
        toast((res.d.product_title || 'Producto') + ' añadido al carrito', true);
        return fetch((N.cartUrl || '/cart') + '.js', { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); });
      })
      .then(function (c) { if (c) setBadge(c.item_count, true); })
      .catch(function (err) { toast(err.message || 'No pudimos añadir el producto. Intenta de nuevo.'); })
      .then(function () { if (btn) btn.disabled = false; });
  });

  /* ---------- selector de cantidad ---------- */
  $$('[data-qty]').forEach(function (q) {
    var input = q.querySelector('input');
    var minus = q.querySelector('[data-d="-1"]'), plus = q.querySelector('[data-d="1"]');
    var min = input.hasAttribute('data-autosubmit') ? 0 : 1, max = parseInt(input.max || '10', 10);
    function sync() { var v = parseInt(input.value || '1', 10); minus.disabled = v <= min; plus.disabled = v >= max; }
    q.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var v = Math.max(min, Math.min(max, (parseInt(input.value || '1', 10) || 1) + Number(b.dataset.d)));
      input.value = v; sync();
      if (input.hasAttribute('data-autosubmit')) input.form.submit();
    });
    input.addEventListener('change', function () { if (input.hasAttribute('data-autosubmit')) input.form.submit(); else sync(); });
    sync();
  });

  /* ---------- galería de la ficha ---------- */
  var g = $('[data-gallery]');
  if (g) g.addEventListener('click', function (e) {
    var b = e.target.closest('[data-full]'); if (!b) return;
    $$('[data-full]', g).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    var main = $('#gmain', g);
    var img = document.createElement('img');
    img.src = b.dataset.full; img.alt = b.dataset.alt || ''; img.decoding = 'async';
    main.innerHTML = ''; main.appendChild(img);
  });

  /* ---------- barra de compra fija (celular) ---------- */
  var sticky = $('.stickybuy'), buy = $('[data-main-buy]');
  if (sticky && buy && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      var on = !es[0].isIntersecting;
      sticky.classList.toggle('is-on', on);
      sticky.setAttribute('aria-hidden', String(!on));
      var sb = sticky.querySelector('button'); if (sb) sb.tabIndex = on ? 0 : -1;
      document.body.classList.toggle('has-sticky', on);
    }).observe(buy);
  }

  /* ---------- menú del celular ---------- */
  var drawer = $('#drawer'), menuBtn = $('#menuBtn');
  if (drawer && menuBtn) {
    document.body.appendChild(drawer);
    var setOpen = function (open) {
      drawer.classList.toggle('is-open', open); drawer.setAttribute('aria-hidden', String(!open));
      menuBtn.setAttribute('aria-expanded', String(open)); document.body.style.overflow = open ? 'hidden' : '';
      if (open) { var c = drawer.querySelector('.icon-btn[data-close]'); if (c) c.focus(); }
    };
    menuBtn.addEventListener('click', function () { setOpen(true); });
    drawer.addEventListener('click', function (e) { if (e.target.closest('[data-close]') || e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }
  var nav = $('#nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- videos de portada (se alternan) ---------- */
  var hero = $('.vhero');
  if (hero) {
    var vids = $$('video', hero), dots = $$('[data-vid]', hero);
    var small = window.matchMedia('(max-width: 760px)').matches, cur = 0;
    vids.forEach(function (v) { v.muted = true; v.defaultMuted = true; v.src = small ? v.dataset.srcSm : v.dataset.src; });
    var show = function (i) {
      cur = i;
      vids.forEach(function (v, k) { v.classList.toggle('is-on', k === i); if (k !== i) v.pause(); });
      dots.forEach(function (d, k) { d.setAttribute('aria-pressed', String(k === i)); });
      var v = vids[i]; v.currentTime = 0;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      vids[(i + 1) % vids.length].preload = 'auto';
    };
    vids.forEach(function (v) { v.addEventListener('ended', function () { show((cur + 1) % vids.length); }); });
    dots.forEach(function (d) { d.addEventListener('click', function () { show(Number(d.dataset.vid)); }); });
    var resume = function () { var v = vids[cur]; if (document.visibilityState === 'visible' && v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } };
    document.addEventListener('visibilitychange', resume);
    vids.forEach(function (v) { v.addEventListener('canplay', resume); });
    if (vids.length) show(0);
  }

  /* ---------- aparición suave al hacer scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else { reveals.forEach(function (el) { el.classList.add('is-in'); }); }

  /* ---------- gatito del pie de página ---------- */
  var m = $('.mascot');
  if (m && m.querySelector('.logo__face') && 'IntersectionObserver' in window && N.mascot && N.mascot.length) {
    var bubble = m.querySelector('.mascot__bubble'), i = 0, visible = false, timer = null;
    var talk = function () {
      var msg = N.mascot[i++ % N.mascot.length], href = msg[1], ext = /^https?:/.test(href);
      bubble.textContent = msg[0]; bubble.setAttribute('href', href);
      if (ext) { bubble.target = '_blank'; bubble.rel = 'noopener'; } else { bubble.removeAttribute('target'); bubble.removeAttribute('rel'); }
      m.classList.add('is-awake');
      setTimeout(function () { m.classList.add('is-talking'); }, 250);
      setTimeout(function () { m.classList.remove('is-talking'); setTimeout(function () { m.classList.remove('is-awake'); }, 350); }, 4200);
    };
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !timer) { talk(); timer = setInterval(function () { if (visible) talk(); }, 8000); }
    }, { threshold: 0.6 }).observe(m);
  }
})();
