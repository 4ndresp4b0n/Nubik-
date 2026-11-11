import { icon } from './icons.js';
import { money, escapeHtml, waLink, store } from './util.js';
import { faqs, legal, departamentos } from './content.js';

// ------------------------------------------------------------------ datos
const BOOT = JSON.parse(document.getElementById('boot').textContent);
const CFG = BOOT.config;
const PRODUCTS = BOOT.products;
const SEO = BOOT.seo;
const WA = CFG.contact.whatsappNumber;
const MAXQ = CFG.limits.maxQtyPerItem;
// Vista previa estática (tools/build_preview.py): rutas relativas, navegación por #nombre
// y pedidos por WhatsApp, porque no hay servidor que valide precios ni registre pedidos.
const STATIC = BOOT.static === true;
const A = p => STATIC ? p.replace(/^\//, '') : p;
const IMG = A('/assets/img/productos/');
const ROUTE_HASH = {
  '/': '', '/productos/pelota-interactiva': 'pelota-interactiva', '/combo-nubik': 'combo-nubik',
  '/carrito': 'carrito', '/checkout': 'finalizar-pedido', '/preguntas-frecuentes': 'preguntas-frecuentes',
  '/envios-y-garantias': 'envios-y-garantias', '/privacidad': 'privacidad', '/terminos': 'terminos',
  '/cambios-y-devoluciones': 'cambios-y-devoluciones',
};
const HASH_ROUTE = Object.fromEntries(Object.entries(ROUTE_HASH).map(([p, h]) => [h, p]));
const SECTION_ROUTE = { productos: '/', combo: '/', momentos: '/', garantia: '/envios-y-garantias' };
function staticHref(href) {
  const url = new URL(href, 'http://x');
  let path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/productos/guante-quitapelos') path = '/combo-nubik';
  const anchor = url.hash.slice(1);
  return '#' + (anchor && SECTION_ROUTE[anchor] ? anchor : (ROUTE_HASH[path] ?? 'no-encontrada'));
}
function currentRoute() {
  if (!STATIC) return { path: location.pathname.replace(/\/+$/, '') || '/', anchor: location.hash.slice(1) };
  const h = decodeURIComponent(location.hash.slice(1));
  if (h in HASH_ROUTE) return { path: HASH_ROUTE[h], anchor: '' };
  if (SECTION_ROUTE[h]) return { path: SECTION_ROUTE[h], anchor: h };
  return { path: '/no-encontrada', anchor: '' };
}
function quoteLocal(items) {
  // mismas reglas que server.price_cart (en la vista previa no hay servidor)
  if (!Array.isArray(items) || !items.length) throw new Error('El carrito está vacío.');
  const lines = [];
  for (const it of items) {
    const p = PRODUCTS[it.id];
    if (!p) throw new Error('Producto no disponible.');
    if (!p.sellableAlone || p.price == null) throw new Error(`${p.shortName} no se vende individualmente. Está incluido en el Combo NUBIK.`);
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAXQ) throw new Error('Cantidad inválida.');
    lines.push({ id: it.id, sku: p.sku, name: p.name, qty: it.qty, unitPrice: p.price, lineTotal: p.price * it.qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return { lines, subtotal, shipping: 0, total: subtotal, currency: 'COP' };
}
const img = (name, alt, { w = 960, cls = '', eager = false, sizes = '' } = {}) =>
  `<img src="${IMG}${name}-${w}.webp" srcset="${IMG}${name}-480.webp 480w, ${IMG}${name}-960.webp 960w" ${sizes ? `sizes="${sizes}"` : ''} alt="${escapeHtml(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" class="${cls}">`;

// ------------------------------------------------------------------ carrito
const cartStore = store('nubik_cart_v1');
const cart = {
  items: sanitize(cartStore.get()?.items),
  count() { return this.items.reduce((s, i) => s + i.qty, 0); },
  save() { cartStore.set({ items: this.items }); renderBadge(true); },
  add(id, qty = 1) {
    const p = PRODUCTS[id];
    if (!p || !p.sellableAlone || p.price == null) {
      toast('Este producto solo está disponible dentro del Combo NUBIK.');
      return false;
    }
    const line = this.items.find(i => i.id === id);
    const next = Math.min(MAXQ, (line ? line.qty : 0) + qty);
    if (line) line.qty = next; else this.items.push({ id, qty: next });
    this.save();
    return true;
  },
  setQty(id, qty) {
    const line = this.items.find(i => i.id === id);
    if (!line) return;
    line.qty = Math.max(1, Math.min(MAXQ, qty));
    this.save();
  },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); },
  clear() { this.items = []; this.save(); },
  // Estimación local solo para mostrar; el total válido siempre lo calcula el servidor.
  localTotal() { return this.items.reduce((s, i) => s + PRODUCTS[i.id].price * i.qty, 0); },
};
function sanitize(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(i => i && PRODUCTS[i.id]?.sellableAlone && Number.isInteger(i.qty) && i.qty > 0)
    .map(i => ({ id: i.id, qty: Math.min(MAXQ, i.qty) }));
}

async function api(path, body) {
  if (STATIC) {
    if (path === '/api/cart/quote') return quoteLocal(body.items);
    throw new Error('En la vista previa los pedidos se coordinan por WhatsApp.');
  }
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok) throw new Error(data?.error || 'No pudimos conectar con la tienda. Intenta de nuevo.');
  return data;
}

// ------------------------------------------------------------------ shell
const logo = (cls = '') => CFG.brand.logoAvailable
  ? `<img src="${A(CFG.brand.logoSrc)}" alt="${CFG.brand.logoAlt}" class="logo--normal ${cls}"><img src="${A(CFG.brand.logoSrc.replace(/\.png$/, '-claro.png'))}" alt="" aria-hidden="true" class="logo--claro ${cls}">`
  : `<span class="brand__text ${cls}" title="Logo oficial pendiente de cargar en ${CFG.brand.logoSrc}">NUBIK</span>`;

const NAV = [
  ['/', 'Inicio'], ['/#productos', 'Productos'], ['/combo-nubik', 'Combo'],
  ['/envios-y-garantias', 'Envíos y garantías'], ['/preguntas-frecuentes', 'Preguntas frecuentes'],
];

function waGeneral() { return waLink(WA, 'Hola NUBIK, tengo una consulta: '); }
function waProduct(id, qty = 1) {
  const p = PRODUCTS[id];
  return waLink(WA, `Hola NUBIK, quiero consultar por: ${p.name}\nCantidad: ${qty}\nPrecio: ${money(p.price)} COP c/u\nMi consulta: `);
}

function renderShell() {
  document.getElementById('nav').innerHTML = `
    <div class="wrap nav__in">
      <a class="brand" href="/" aria-label="NUBIK, ir al inicio">${logo()}</a>
      <nav aria-label="Principal"><ul class="nav__links">${NAV.map(([h, t]) => `<li><a href="${h}" data-path="${h}">${t}</a></li>`).join('')}</ul></nav>
      <div class="nav__actions">
        <a class="btn btn--ghost btn--sm nav__wa" href="${waGeneral()}" target="_blank" rel="noopener">${icon('chat')} WhatsApp</a>
        <a class="icon-btn" href="/carrito" aria-label="Ver carrito">${icon('bag')}<span class="badge" id="badge" aria-hidden="true"></span></a>
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Abrir menú" aria-expanded="false" aria-controls="drawer">${icon('menu')}</button>
      </div>
    </div>`;
  const drawerEl = document.createElement('div');
  drawerEl.className = 'drawer'; drawerEl.id = 'drawer'; drawerEl.setAttribute('aria-hidden', 'true');
  drawerEl.innerHTML = `
      <div class="drawer__bg" data-close></div>
      <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="Menú">
        <div class="drawer__head"><a class="brand" href="/">${logo()}</a><button class="icon-btn" data-close aria-label="Cerrar menú">${icon('x')}</button></div>
        ${NAV.map(([h, t]) => `<a class="dl" href="${h}">${t}</a>`).join('')}
        <a class="dl" href="/carrito">Carrito</a>
        <a class="btn btn--nube btn--block" style="margin-top:auto" href="${waGeneral()}" target="_blank" rel="noopener">${icon('chat')} Escríbenos por WhatsApp</a>
      </div>`;
  document.body.appendChild(drawerEl);
  const drawer = drawerEl, btn = document.getElementById('menuBtn');
  const setOpen = open => {
    drawer.classList.toggle('is-open', open); drawer.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open)); document.body.style.overflow = open ? 'hidden' : '';
    if (open) drawer.querySelector('[data-close].icon-btn').focus();
  };
  btn.addEventListener('click', () => setOpen(true));
  drawer.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  addEventListener('scroll', () => document.getElementById('nav').classList.toggle('is-scrolled', scrollY > 8), { passive: true });

  document.getElementById('footer').innerHTML = `
    <div class="wrap">
      <div class="footer__grid">
        <div>
          <a class="brand" href="/" aria-label="NUBIK, ir al inicio">${logo()}</a>
          <p class="footer__slogan">${CFG.brand.slogan}.</p>
          <p class="small">Productos para gatos y perros con envío gratis en ${CFG.brand.country}.</p>
        </div>
        <div><h4>Tienda</h4><ul>
          <li><a href="/productos/pelota-interactiva">Pelota interactiva</a></li>
          <li><a href="/combo-nubik">Combo NUBIK</a></li>
          <li><a href="/carrito">Carrito</a></li></ul></div>
        <div><h4>Ayuda</h4><ul>
          <li><a href="/envios-y-garantias">Envíos</a></li>
          <li><a href="/envios-y-garantias#garantia">Garantías</a></li>
          <li><a href="/preguntas-frecuentes">Preguntas frecuentes</a></li>
          <li><a href="${waGeneral()}" target="_blank" rel="noopener">WhatsApp ${CFG.contact.whatsappDisplay}</a></li></ul></div>
        <div><h4>Legal</h4><ul>
          <li><a href="/privacidad">Política de privacidad</a></li>
          <li><a href="/terminos">Términos y condiciones</a></li>
          <li><a href="/cambios-y-devoluciones">Cambios y devoluciones</a></li></ul></div>
      </div>
      <div class="footer__bottom"><span>© ${new Date().getFullYear()} NUBIK · Colombia</span><span>Envío gratis · Sin pago contra entrega</span></div>
    </div>`;

  const fab = document.createElement('a');
  fab.className = 'fab'; fab.href = waGeneral(); fab.target = '_blank'; fab.rel = 'noopener';
  fab.setAttribute('aria-label', 'Escríbenos por WhatsApp');
  fab.innerHTML = `${icon('chat')}<span>¿Dudas? Escríbenos</span>`;
  document.body.appendChild(fab);
  renderBadge(false);
}

function renderBadge(bump) {
  const b = document.getElementById('badge'); if (!b) return;
  const n = cart.count();
  b.textContent = n; b.classList.toggle('is-on', n > 0);
  b.parentElement.setAttribute('aria-label', n ? `Ver carrito, ${n} producto${n > 1 ? 's' : ''}` : 'Ver carrito, vacío');
  if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}

let toastTimer;
function toast(msg, withCart = false) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${escapeHtml(msg)}</span>${withCart ? '<a href="/carrito">Ver carrito</a>' : ''}`;
  t.classList.add('is-on'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3600);
}

// ------------------------------------------------------------------ piezas reutilizables
const ball = PRODUCTS['pelota-interactiva'], combo = PRODUCTS['combo-nubik'];
const freeShip = `<span class="ship-note">${icon('truck')} ${CFG.shipping.label}</span>`;
const availability = p => p.availability === 'disponible'
  ? '<span class="stock stock--ok">Disponible</span>'
  : p.availability === 'agotado' ? '<span class="stock">Agotado temporalmente</span>'
  : '<span class="stock">Disponibilidad por confirmar al registrar tu pedido</span>';

const ballPoints = `
  <ul class="points">
    <li><span class="pi">${icon('move')}</span><div><strong>Movimiento automático</strong><span>Se mueve sola para hacer el juego más dinámico.</span></div></li>
    <li><span class="pi">${icon('layers')}</span><div><strong>Tres modos de funcionamiento</strong><span>Distintas opciones de entretenimiento.</span></div></li>
    <li><span class="pi">${icon('battery')}</span><div><strong>Recargable</strong><span>Necesita estar cargada para funcionar.</span></div></li>
    <li><span class="pi">${icon('plug')}</span><div><strong>Cargador incluido</strong><span>Viene en la caja junto con la pelota.</span></div></li>
  </ul>`;

const comboArt = `
  <div class="combo__art">
    <figure>${img('gatito-pelota', 'Gatito naranja persiguiendo la pelota interactiva NUBIK sobre una alfombra', { sizes: '(min-width: 900px) 280px, 45vw' })}</figure>
    <figure>${img('vida-gato-guante', 'Gato relajado mientras lo cepillan con el guante quitapelos NUBIK', { sizes: '(min-width: 900px) 280px, 45vw' })}</figure>
    <span class="combo__plus" aria-hidden="true">${icon('plus')}</span>
  </div>`;

const comboIncl = `
  <ul class="incl">
    <li>${icon('check')} 1 pelota interactiva NUBIK + cargador</li>
    <li>${icon('check')} 1 guante quitapelos NUBIK <em>Solo en combo</em></li>
    <li>${icon('truck')} Envío gratis a toda Colombia</li>
  </ul>`;

function faqList(items) {
  return `<div class="faq">${items.map(f => `
    <details><summary>${f.q}${icon('chevron')}</summary><div class="ans">${f.a}</div></details>`).join('')}</div>`;
}

function trustCards() {
  return `<div class="trust">
    <div class="tcard tcard--hi">${icon('truck')}<h3>Envío gratis</h3><p>No pagas envío. NUBIK asume su costo en todos los pedidos.</p></div>
    <div class="tcard">${icon('clock')}<h3>Entrega estimada</h3><p>${CFG.shipping.estimates.map(e => `${e.zone}: <strong>${e.businessDays}</strong>`).join('<br>')}.</p></div>
    <div class="tcard">${icon('card')}<h3>Medios de pago</h3>${TRANSFER ? '<p>Transferencia bancaria. Te damos los datos de la cuenta al hacer tu pedido.</p><span class="pill-pending">Tarjeta: próximamente</span>' : `<p>${CFG.payments.methods.map(m => m.label).join(' y ')}.</p><span class="pill-pending">Pendientes de habilitación</span>`}</div>
    <div class="tcard">${icon('chat')}<h3>Atención por WhatsApp</h3><p>Resolvemos tus dudas antes y después de tu compra en el ${CFG.contact.whatsappDisplay}.</p></div>
  </div>`;
}

// ------------------------------------------------------------------ vistas
const VID = A('/assets/video/');
const HERO_VIDEOS = [
  { src: VID + 'portada-pelota.mp4', sm: VID + 'portada-pelota-sm.mp4', poster: VID + 'portada-pelota.jpg', label: 'pelota interactiva rodando con un gato' },
  { src: VID + 'portada-guante.mp4', sm: VID + 'portada-guante-sm.mp4', poster: VID + 'portada-guante.jpg', label: 'gato cepillado con el guante quitapelos' },
];

// Alterna los dos videos de portada (silenciados, sin sonido) con un fundido.
// Se reproducen siempre, también con "reducir movimiento" activo en el sistema:
// en Windows ese ajuste se activa al apagar los efectos de animación.
function mountHero() {
  const hero = document.querySelector('.vhero'); if (!hero) return;
  const vids = [...hero.querySelectorAll('video')];
  const dots = [...hero.querySelectorAll('[data-vid]')];
  const small = matchMedia('(max-width: 760px)').matches;
  // innerHTML no aplica la propiedad muted; sin ella el navegador bloquea la reproducción automática
  vids.forEach(v => { v.muted = true; v.defaultMuted = true; v.src = small ? v.dataset.srcSm : v.dataset.src; });
  let cur = 0;
  const show = i => {
    cur = i;
    vids.forEach((v, k) => { v.classList.toggle('is-on', k === i); if (k !== i) v.pause(); });
    dots.forEach((d, k) => d.setAttribute('aria-pressed', String(k === i)));
    const v = vids[i]; v.currentTime = 0;
    v.play().catch(() => { /* si el navegador lo bloquea queda el póster */ });
    vids[(i + 1) % vids.length].preload = 'auto';
  };
  vids.forEach(v => v.addEventListener('ended', () => show((cur + 1) % vids.length)));
  dots.forEach(d => d.addEventListener('click', () => show(Number(d.dataset.vid))));
  // si la página cargó en segundo plano, reintenta al hacerse visible
  const resume = () => { const v = vids[cur]; if (document.visibilityState === 'visible' && v.paused && document.body.contains(v)) v.play().catch(() => {}); };
  document.addEventListener('visibilitychange', resume);
  vids.forEach(v => v.addEventListener('canplay', resume));
  show(0);
}

// Estado real de los medios de pago (la transferencia se activa al completar sus datos en config)
const TRANSFER = !!CFG.payments.transferReady;
const payLine = () => TRANSFER
  ? '<strong>Transferencia bancaria disponible.</strong> Tarjeta próximamente. Sin pago contra entrega.'
  : 'Transferencia y tarjeta previstas, <strong>pendientes de habilitación</strong>. Sin pago contra entrega.';

const views = {};

views['/'] = () => `
  <section class="vhero" aria-label="Portada">
    <div class="vhero__media" aria-hidden="true">
      ${HERO_VIDEOS.map((v, i) => `<video class="vhero__video${i === 0 ? ' is-on' : ''}" data-src="${v.src}" data-src-sm="${v.sm}" poster="${v.poster}" muted playsinline preload="${i === 0 ? 'auto' : 'none'}"></video>`).join('')}
    </div>
    <div class="vhero__shade" aria-hidden="true"></div>
    <div class="wrap vhero__copy">
      <span class="vhero__eyebrow">${CFG.brand.slogan}</span>
      <h1 class="vhero__title">Pequeños momentos.<br><span>Grandes ronroneos.</span></h1>
      <p class="vhero__lead">Descubre nuevas formas de acompañar el juego y el cuidado de tu mascota con NUBIK.</p>
      <div class="btn-row vhero__btns">
        <a class="btn btn--nube" href="/productos/pelota-interactiva">Descubrir la pelota</a>
        <a class="btn btn--ghost-light" href="/combo-nubik">Conocer el combo</a>
      </div>
      <div class="vhero__feats"><span>Se mueve sola</span><span>3 modos</span><span>Cargador incluido</span><span>Envío gratis</span></div>
    </div>
    <div class="vhero__dots" role="group" aria-label="Videos de portada">
      ${HERO_VIDEOS.map((v, i) => `<button type="button" data-vid="${i}" aria-label="Ver video: ${v.label}" aria-pressed="${i === 0}"></button>`).join('')}
    </div>
  </section>

  <div class="ribbon" aria-hidden="true"><div class="ribbon__track">${Array(2).fill(['Envío gratis en Colombia', 'Se mueve sola', 'Tres modos', 'Cargador incluido', 'Combo con guante quitapelos', CFG.brand.slogan].map(t => `<span>${t}</span>`).join('')).join('')}</div></div>

  <section class="section section--white" id="productos">
    <div class="wrap feature">
      <div class="mosaic reveal">
        <figure class="m1">${img('pelota-frontal', 'Pelota interactiva NUBIK azul con botón de encendido', { sizes: '(min-width: 900px) 360px, 55vw' })}</figure>
        <figure>${img('real-pelota-palma', 'Fotografía real de la pelota interactiva NUBIK en la palma de la mano', { w: 480 })}</figure>
        <figure>${img('pelota-gato', 'Gato abrazando la pelota interactiva NUBIK', { w: 480 })}</figure>
      </div>
      <div class="reveal">
        <span class="eyebrow">Pelota interactiva</span>
        <h2 class="h2">El juego se mueve con NUBIK</h2>
        <p class="lead">Haz que los momentos de juego de tu gato sean más dinámicos con su movimiento automático y sus tres modos.</p>
        ${ballPoints}
        <div class="price-row"><span class="price">${money(ball.price)}<small>COP</small></span>${freeShip}</div>
        <div class="btn-row">
          <button class="btn" data-add="pelota-interactiva">${icon('bag')} Añadir al carrito</button>
          <a class="btn btn--ghost" href="/productos/pelota-interactiva">Ver detalles</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="combo">
    <div class="wrap">
      <div class="combo reveal">
        ${comboArt}
        <div>
          <span class="tag">Oferta destacada</span>
          <h2 class="h2" style="margin-top:18px">Dos formas de cuidar sus momentos</h2>
          <p class="lead">Juego y cuidado del pelaje en un solo paquete: la pelota interactiva y el guante quitapelos, juntos.</p>
          ${comboIncl}
          <div class="price-row"><span class="price">${money(combo.price)}<small>COP</small></span></div>
          <div class="btn-row">
            <button class="btn btn--nube" data-add="combo-nubik">${icon('bag')} Quiero el combo</button>
            <a class="btn btn--ghost-light" href="/combo-nubik">Ver el combo</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--white" id="momentos">
    <div class="wrap">
      <span class="eyebrow">Momentos NUBIK</span>
      <h2 class="h2 reveal" style="max-width:16ch">Juego y cuidado, todos los días</h2>
      <div class="life">
        <figure class="life__big reveal">${img('vida-gato-pelota', 'Gato atrapando la pelota interactiva NUBIK sobre el piso de la sala', { sizes: '(min-width: 900px) 700px, 92vw' })}
          <figcaption><span class="tag">Juego</span> Pelota interactiva para gatos</figcaption></figure>
        <figure class="reveal">${img('vida-gato-guante', 'Gato con los ojos cerrados mientras lo cepillan con el guante quitapelos NUBIK', { sizes: '(min-width: 900px) 480px, 92vw' })}
          <figcaption><span class="tag tag--nube">Cuidado</span> Guante quitapelos en gatos</figcaption></figure>
        <figure class="reveal">${img('vida-perro-guante', 'Perro golden retriever cepillado con el guante quitapelos NUBIK', { sizes: '(min-width: 900px) 480px, 92vw' })}
          <figcaption><span class="tag tag--nube">Cuidado</span> Guante quitapelos en perros</figcaption></figure>
      </div>
      <div class="btn-row" style="margin-top:28px"><a class="btn" href="/combo-nubik">Quiero el combo</a><a class="btn btn--ghost" href="/productos/pelota-interactiva">Ver la pelota</a></div>
    </div>
  </section>

  <section class="section">
    <div class="wrap center">
      <span class="eyebrow">Beneficios</span>
      <h2 class="h2 reveal">Pensado para sus pequeños grandes momentos</h2>
      <div class="cards">
        <article class="card reveal"><div class="card__ico">${icon('move')}</div><h3>Entretenimiento</h3><p>Una pelota con movimiento automático y tres modos de funcionamiento para variar sus ratos de juego.</p></article>
        <article class="card reveal"><div class="card__ico">${icon('hand')}</div><h3>Cuidado</h3><p>Un guante para ayudar a retirar el pelo suelto de perros y gatos durante su rutina de cuidado.</p></article>
        <article class="card reveal"><div class="card__ico">${icon('truck')}</div><h3>Comodidad</h3><p>Compra online desde casa con envío gratis a toda Colombia.</p></article>
      </div>
    </div>
  </section>

  <section class="section section--dark">
    <div class="wrap">
      <span class="eyebrow">Cómo funciona</span>
      <h2 class="h2 reveal" style="color:#fff;max-width:16ch">Simple de entender, fácil de disfrutar</h2>
      <div class="steps">
        <div class="step reveal"><h3>Qué hace la pelota</h3><p>Se mueve sola y ofrece tres modos de funcionamiento.</p></div>
        <div class="step reveal"><h3>Cárgala primero</h3><p>Necesita estar cargada para funcionar. Cárgala antes de usarla.</p></div>
        <div class="step reveal"><h3>Qué trae la caja</h3><p>La pelota interactiva y su cargador.</p></div>
        <div class="step reveal"><h3>Para qué sirve el guante</h3><p>Ayuda a retirar el pelo suelto de perros y gatos al pasarlo por el pelaje.</p></div>
        <div class="step reveal"><h3>Qué incluye el combo</h3><p>Una pelota interactiva con su cargador y un guante quitapelos.</p></div>
      </div>
    </div>
  </section>

  <section class="section section--nube">
    <div class="wrap">
      <span class="eyebrow">Sin filtros</span>
      <h2 class="h2 reveal" style="max-width:18ch">Fotos reales de los productos</h2>
      <p class="lead">Así se ven la pelota y el guante fuera del estudio.</p>
      <div class="real">
        <figure class="reveal">${img('real-pelota-palma', 'Fotografía real de la pelota interactiva en la mano', { w: 480 })}</figure>
        <figure class="reveal">${img('real-guante-mano', 'Fotografía real del guante quitapelos puesto', { w: 480 })}</figure>
        <figure class="reveal">${img('real-pelota-alfombra', 'Fotografía real de la pelota interactiva sobre una alfombra', { w: 480 })}</figure>
        <figure class="reveal">${img('real-guante-lateral', 'Fotografía real del guante quitapelos visto de lado', { w: 480 })}</figure>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <span class="eyebrow">Envíos y pagos</span>
      <h2 class="h2 reveal">Compra con tranquilidad</h2>
      ${trustCards()}
      <p class="muted small" style="margin-top:18px">Los tiempos de entrega son estimados y dependen de la transportadora. No ofrecemos pago contra entrega. <a class="link" href="/envios-y-garantias">Ver horarios de despacho</a></p>
    </div>
  </section>

  <section class="section section--white">
    <div class="wrap center">
      <span class="eyebrow">Preguntas frecuentes</span>
      <h2 class="h2">Lo que más nos preguntan</h2>
      ${faqList(faqs(CFG, PRODUCTS).slice(0, 5))}
      <div class="btn-row" style="justify-content:center;margin-top:28px">
        <a class="btn btn--ghost" href="/preguntas-frecuentes">Ver todas las preguntas</a>
        <a class="btn btn--nube" href="${waGeneral()}" target="_blank" rel="noopener">${icon('chat')} Pregúntanos</a>
      </div>
    </div>
  </section>`;

function productPage({ id, crumbs, eyebrow, title, intro, body, gallery }) {
  const p = PRODUCTS[id];
  return `
  <div class="wrap">
    <nav class="crumbs" aria-label="Ruta de navegación"><a href="/">Inicio</a> / ${crumbs}</nav>
    <div class="pdp">
      <div class="gallery" data-gallery>
        <div class="gallery__main ${gallery[0][2] ? 'is-photo' : ''}" id="gmain">${img(gallery[0][0], gallery[0][1], { eager: true, sizes: '(min-width: 960px) 620px, 92vw' })}</div>
        <div class="gallery__thumbs" role="group" aria-label="Imágenes del producto">
          ${gallery.map(([n, alt, photo], i) => `<button type="button" aria-pressed="${i === 0}" aria-label="Ver imagen ${i + 1}: ${escapeHtml(alt)}" data-img="${n}" data-alt="${escapeHtml(alt)}" data-photo="${photo ? 1 : 0}">${img(n, '', { w: 480, sizes: '96px' })}</button>`).join('')}
        </div>
      </div>
      <div class="pdp__info">
        <span class="eyebrow">${eyebrow}</span>
        <h1>${title}</h1>
        <div class="price-row"><span class="price">${money(p.price)}<small>COP</small></span>${freeShip}</div>
        ${availability(p)}
        <p class="lead" style="margin-top:16px">${intro}</p>
        <div class="buy">
          <div class="buy__row">
            <div class="qty" data-qty><button type="button" data-d="-1" aria-label="Restar una unidad">${icon('minus')}</button><output aria-live="polite" aria-label="Cantidad">1</output><button type="button" data-d="1" aria-label="Sumar una unidad">${icon('plus')}</button></div>
            <button class="btn" data-add="${id}" data-with-qty>${icon('bag')} ${id === 'combo-nubik' ? 'Quiero el combo' : 'Añadir al carrito'}</button>
          </div>
          <a class="btn btn--ghost btn--block" data-wa-product="${id}" href="${waProduct(id)}" target="_blank" rel="noopener">${icon('chat')} Consultar por WhatsApp</a>
        </div>
        <div class="perks">
          <div>${icon('truck')}<span><strong>Envío gratis.</strong> ${CFG.shipping.estimates.map(e => `${e.zone}: ${e.businessDays}`).join(' · ')} (estimado).</span></div>
          <div>${icon('card')}<span>${payLine()}</span></div>
        </div>
        ${body}
      </div>
    </div>
  </div>`;
}

views['/productos/pelota-interactiva'] = () => productPage({
  id: 'pelota-interactiva', crumbs: '<span>Pelota interactiva</span>', eyebrow: 'Juguete interactivo para gatos',
  title: 'Pelota interactiva NUBIK',
  intro: 'Haz que los momentos de juego de tu gato sean más dinámicos con la pelota interactiva NUBIK. Su movimiento automático y sus tres modos de funcionamiento ofrecen distintas opciones de entretenimiento.',
  gallery: [
    ['pelota-frontal', 'Pelota interactiva NUBIK azul'],
    ['vida-gato-pelota', 'Gato atrapando la pelota interactiva NUBIK en la sala', true],
    ['collage-gato-pelota', 'Gato jugando con la pelota interactiva NUBIK sobre el piso', true],
    ['pelota-gato-juego', 'Gato jugando con la pelota interactiva NUBIK', true],
    ['pelota-gato', 'Gato abrazando la pelota interactiva NUBIK'],
    ['real-pelota-palma', 'Fotografía real de la pelota en la palma de la mano', true],
    ['real-pelota-encendida', 'Fotografía real de la pelota interactiva sostenida con los dedos', true],
    ['real-pelota-lateral', 'Fotografía real de la pelota vista de lado', true],
    ['real-pelota-alfombra', 'Fotografía real de la pelota sobre una alfombra', true],
  ],
  body: `
    <div class="notice notice--info">${icon('battery')}<span><strong>Recuerda cargarla antes de usarla:</strong> el cargador viene incluido en la caja.</span></div>
    <div class="tabs-block">
      <h2 class="h3">Características</h2>
      <ul class="spec">
        <li>${icon('check')} Se mueve sola.</li>
        <li>${icon('check')} Tres modos de funcionamiento.</li>
        <li>${icon('check')} Necesita estar cargada para funcionar.</li>
        <li>${icon('check')} Cargador incluido en la caja.</li>
      </ul>
      <p class="muted small">¿Prefieres llevarla con el guante quitapelos? <a class="link" href="/combo-nubik">Conoce el Combo NUBIK por ${money(combo.price)} COP</a>.</p>
    </div>
    <div class="tabs-block">
      <h2 class="h3">Preguntas frecuentes</h2>
      ${faqList(faqs(CFG, PRODUCTS).filter((_, i) => [0, 1, 2, 6, 8].includes(i)))}
    </div>`,
});

views['/combo-nubik'] = () => productPage({
  id: 'combo-nubik', crumbs: '<span>Combo NUBIK</span>', eyebrow: 'Oferta destacada · Juego + cuidado',
  title: 'Combo NUBIK: pelota interactiva + guante quitapelos',
  intro: 'Dos formas de cuidar sus momentos: la pelota interactiva para jugar y el guante quitapelos para ayudar a retirar el pelo suelto de perros y gatos.',
  gallery: [
    ['vida-gato-guante', 'Gato relajado mientras lo cepillan con el guante quitapelos NUBIK', true],
    ['vida-gato-pelota', 'Gato atrapando la pelota interactiva NUBIK', true],
    ['vida-perro-guante', 'Perro cepillado con el guante quitapelos NUBIK', true],
    ['collage-gato-guante-pelo', 'Guante quitapelos NUBIK con pelo suelto retirado de un gato', true],
    ['collage-perro-guante', 'Guante quitapelos NUBIK sobre el pelaje de un perro', true],
    ['pelota-gato', 'Pelota interactiva NUBIK incluida en el combo'],
    ['guante-mano', 'Guante quitapelos NUBIK incluido en el combo'],
    ['guante-perro', 'Guante quitapelos NUBIK usado con un perro'],
    ['guante-angulo', 'Guante quitapelos NUBIK visto en ángulo'],
    ['pelota-frontal', 'Pelota interactiva NUBIK'],
    ['real-guante-mano', 'Fotografía real del guante quitapelos puesto', true],
    ['real-guante-lateral', 'Fotografía real del guante quitapelos de lado', true],
    ['real-pelota-palma', 'Fotografía real de la pelota interactiva', true],
  ],
  body: `
    <div class="tabs-block">
      <h2 class="h3">Qué incluye</h2>
      <ul class="spec">
        <li>${icon('check')} <span><strong>1 pelota interactiva NUBIK</strong>: se mueve sola, tres modos de funcionamiento, recargable, cargador incluido.</span></li>
        <li>${icon('check')} <span><strong>1 guante quitapelos NUBIK</strong>: para perros y gatos, ayuda a retirar el pelo suelto durante el cuidado del pelaje.</span></li>
      </ul>
      <div class="notice">${icon('info')}<span>El guante quitapelos no se vende por separado: está disponible únicamente dentro de este combo. Si solo quieres la pelota, <a class="link" href="/productos/pelota-interactiva">cómprala por ${money(ball.price)} COP</a>.</span></div>
    </div>
    <div class="tabs-block">
      <h2 class="h3">Preguntas frecuentes</h2>
      ${faqList(faqs(CFG, PRODUCTS).filter((_, i) => [3, 4, 5, 6, 10].includes(i)))}
    </div>`,
});

views['/carrito'] = () => `
  <div class="wrap">
    <div class="page-head"><span class="eyebrow">Tu compra</span><h1>Carrito</h1></div>
    <div id="cartRoot"></div>
  </div>`;

function cartHTML(priced, err) {
  if (!cart.items.length) return `
    <div class="empty" style="margin-bottom:80px">${icon('bag')}<h2 class="h3">Tu carrito está vacío</h2>
      <p class="muted">Empieza por nuestra oferta destacada.</p>
      <div class="btn-row" style="justify-content:center"><a class="btn" href="/combo-nubik">Ver el combo</a><a class="btn btn--ghost" href="/productos/pelota-interactiva">Ver la pelota</a></div></div>`;
  const lines = cart.items.map(i => {
    const p = PRODUCTS[i.id];
    const sl = priced?.lines.find(l => l.id === i.id);
    return `<article class="line">
      <img src="${A(p.image.replace('-960', '-480'))}" alt="" loading="lazy">
      <div><h3><a href="${p.path}" style="text-decoration:none">${p.name}</a></h3>
        <div class="line__meta">${money(p.price)} COP c/u${p.type === 'bundle' ? ' · Incluye pelota + cargador y guante quitapelos' : ' · Cargador incluido'}</div>
        <div class="line__ctrl">
          <div class="qty qty--sm" data-line="${i.id}"><button type="button" data-d="-1" ${i.qty <= 1 ? 'disabled' : ''} aria-label="Restar una unidad de ${p.shortName}">${icon('minus')}</button><output aria-label="Cantidad">${i.qty}</output><button type="button" data-d="1" ${i.qty >= MAXQ ? 'disabled' : ''} aria-label="Sumar una unidad de ${p.shortName}">${icon('plus')}</button></div>
          <span class="line__total">${money(sl ? sl.lineTotal : p.price * i.qty)}</span>
          <button class="rm" data-rm="${i.id}">${icon('trash')} Eliminar</button>
        </div></div></article>`;
  }).join('');
  const sub = priced ? priced.subtotal : cart.localTotal();
  return `<div class="cart">
    <div class="cart__list">${lines}
      ${cart.items.some(i => i.id === 'combo-nubik') ? '' : `<div class="notice notice--info">${icon('sparkle')}<span>¿Quieres sumar el guante quitapelos? Solo está disponible en el <a class="link" href="/combo-nubik">Combo NUBIK (${money(combo.price)} COP)</a>.</span></div>`}
    </div>
    <aside class="summary" aria-label="Resumen del pedido">
      <h2>Resumen</h2>
      <div class="sumrow"><span>Subtotal</span><strong>${money(sub)} COP</strong></div>
      <div class="sumrow"><span>Envío</span><span class="free">Gratis</span></div>
      <div class="sumrow sumrow--total"><span>Total</span><span>${money(priced ? priced.total : sub)} COP</span></div>
      ${err ? `<div class="notice notice--err" style="margin:10px 0">${icon('alert')}<span>${escapeHtml(err)}</span></div>` : ''}
      ${priced ? '' : (err ? '' : `<p class="muted small" style="display:flex;gap:8px;align-items:center"><span class="spinner"></span> Validando precios…</p>`)}
      <a class="btn btn--block" href="/checkout" style="margin-top:12px" ${priced ? '' : 'aria-disabled="true" tabindex="-1"'}>Continuar con el pedido ${icon('arrow')}</a>
      <a class="btn btn--ghost btn--block" style="margin-top:10px" href="${waLink(WA, cartWaText(priced))}" target="_blank" rel="noopener">${icon('chat')} Consultar por WhatsApp</a>
      <p class="muted small" style="margin-top:14px">${TRANSFER ? (STATIC ? 'Pagas por transferencia bancaria: al enviarnos tu pedido por WhatsApp te compartimos los datos de la cuenta y el valor exacto.' : 'Pagas por transferencia bancaria: al registrar tu pedido verás los datos de la cuenta y el valor exacto.') + ' El pedido se confirma cuando NUBIK verifica el pago.' : CFG.payments.notice}</p>
    </aside>
  </div>`;
}

function cartWaText(priced, orderId) {
  const lines = cart.items.map(i => `• ${PRODUCTS[i.id].name} x${i.qty} — ${money(PRODUCTS[i.id].price * i.qty)} COP`).join('\n');
  const total = priced ? priced.total : cart.localTotal();
  if (orderId === 'pedido') return `Hola NUBIK, quiero hacer este pedido:\n${lines}\nTotal: ${money(total)} COP (envío gratis)\nNombre:\nCiudad:\nDirección de entrega:`;
  return `Hola NUBIK, ${orderId ? `registré la solicitud ${orderId}` : 'quiero consultar por este pedido'}:\n${lines}\nTotal: ${money(total)} COP (envío gratis)\nMi consulta: `;
}

async function mountCart() {
  const root = document.getElementById('cartRoot');
  const draw = (priced, err) => { root.innerHTML = cartHTML(priced, err); };
  const validate = async () => {
    if (!cart.items.length) return draw(null);
    draw(null);
    try { draw(await api('/api/cart/quote', { items: cart.items })); }
    catch (e) { draw(null, e.message); }
  };
  root.addEventListener('click', e => {
    const q = e.target.closest('[data-line] button[data-d]');
    if (q) { const id = q.parentElement.dataset.line; const l = cart.items.find(i => i.id === id); cart.setQty(id, l.qty + Number(q.dataset.d)); return validate(); }
    const rm = e.target.closest('[data-rm]');
    if (rm) { cart.remove(rm.dataset.rm); toast('Producto eliminado del carrito'); return validate(); }
    if (e.target.closest('[aria-disabled="true"]')) e.preventDefault();
  });
  validate();
}

views['/checkout'] = () => `
  <div class="wrap">
    <div class="page-head"><span class="eyebrow">Paso final</span><h1>Finalizar pedido</h1></div>
    <div id="coRoot"><p class="muted" style="display:flex;gap:10px;align-items:center;padding:24px 0 80px"><span class="spinner"></span> Validando tu carrito…</p></div>
  </div>`;

function field(name, label, { type = 'text', req = true, attrs = '', hint = '' } = {}) {
  return `<div class="field"><label for="f-${name}">${label}${req ? '' : ' <span class="opt">(opcional)</span>'}</label>
    <input id="f-${name}" name="${name}" type="${type}" ${req ? 'required' : ''} ${attrs} aria-describedby="e-${name}">
    <div class="err" id="e-${name}">${hint}</div></div>`;
}

async function mountCheckout() {
  const root = document.getElementById('coRoot');
  if (!cart.items.length) {
    root.innerHTML = cartHTML(null);
    return;
  }
  let priced;
  try { priced = await api('/api/cart/quote', { items: cart.items }); }
  catch (e) {
    root.innerHTML = `<div class="notice notice--err" style="margin-bottom:80px">${icon('alert')}<span>${escapeHtml(e.message)} <a class="link" href="/carrito">Volver al carrito</a></span></div>`;
    return;
  }
  if (STATIC) {
    root.innerHTML = `
      <div class="cart">
        <div class="form">
          <div class="notice">${icon('info')}<span><strong>Haz tu pedido por WhatsApp.</strong> Envíanos el resumen y coordinamos contigo los datos de entrega y el pago. ${TRANSFER ? 'El pago es por transferencia bancaria: te compartimos los datos de la cuenta por WhatsApp.' : 'Los pagos online están pendientes de habilitación.'} No se realiza ningún cobro en esta página y no ofrecemos pago contra entrega.</span></div>
          <div class="fieldset">
            <h2 class="h3">Cómo sigue tu pedido</h2>
            <ol class="timeline">
              <li><b>1</b><strong>Envías el resumen por WhatsApp</strong><span>Al número ${CFG.contact.whatsappDisplay}.</span></li>
              <li><b>2</b><strong>Confirmamos datos y pago</strong><span>El pedido queda confirmado solo cuando NUBIK te lo confirme.</span></li>
              <li><b>3</b><strong>Despacho y entrega</strong><span>Envío gratis. ${CFG.shipping.estimates.map(e => `${e.zone}: ${e.businessDays}`).join(' · ')} (estimado).</span></li>
            </ol>
          </div>
        </div>
        <aside class="summary" aria-label="Resumen del pedido">
          <h2>Tu pedido</h2>
          ${priced.lines.map(l => `<div class="sumrow"><span>${l.name} × ${l.qty}</span><strong>${money(l.lineTotal)}</strong></div>`).join('')}
          <div class="sumrow"><span>Envío</span><span class="free">Gratis</span></div>
          <div class="sumrow sumrow--total"><span>Total</span><span>${money(priced.total)} COP</span></div>
          <a class="btn btn--block" style="margin-top:14px" href="${waLink(WA, cartWaText(priced, 'pedido'))}" target="_blank" rel="noopener">${icon('chat')} Enviar pedido por WhatsApp</a>
          <p class="muted small" style="margin-top:12px">Abrir WhatsApp no confirma el pedido: la confirmación la recibirás de NUBIK.</p>
        </aside>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="cart">
      <form class="form" id="coForm" novalidate>
        ${TRANSFER
          ? `<div class="notice">${icon('info')}<span><strong>Pago por transferencia bancaria.</strong> Al registrar tu pedido te mostramos la cuenta y el valor exacto. El pedido se confirma cuando NUBIK verifica el pago. Esta página no solicita datos de tarjeta.</span></div>`
          : `<div class="notice">${icon('info')}<span><strong>Pagos online pendientes de habilitación.</strong> Al enviar este formulario registras una <strong>solicitud de pedido</strong>: no se realiza ningún cobro y el pedido no queda confirmado hasta que NUBIK verifique el pago contigo.</span></div>`}
        <fieldset class="fieldset"><legend>Datos de contacto</legend>
          ${field('nombre', 'Nombre completo', { attrs: 'autocomplete="name" minlength="3" maxlength="80"' })}
          <div class="grid2">
            ${field('celular', 'Celular', { type: 'tel', attrs: 'autocomplete="tel-national" inputmode="numeric" pattern="3[0-9]{9}" maxlength="10" placeholder="3001234567"' })}
            ${field('email', 'Correo electrónico', { type: 'email', req: false, attrs: 'autocomplete="email" maxlength="120"' })}
          </div>
        </fieldset>
        <fieldset class="fieldset"><legend>Dirección de entrega</legend>
          <div class="grid2">
            <div class="field"><label for="f-departamento">Departamento</label>
              <select id="f-departamento" name="departamento" required aria-describedby="e-departamento"><option value="">Selecciona…</option>${departamentos.map(d => `<option>${d}</option>`).join('')}</select>
              <div class="err" id="e-departamento"></div></div>
            ${field('ciudad', 'Ciudad o municipio', { attrs: 'autocomplete="address-level2" maxlength="60"' })}
          </div>
          ${field('direccion', 'Dirección', { attrs: 'autocomplete="street-address" minlength="6" maxlength="160" placeholder="Calle, carrera, número"' })}
          ${field('detalle', 'Barrio, apartamento o referencia', { req: false, attrs: 'maxlength="120"' })}
          <div class="field"><label for="f-notas">Notas para tu pedido <span class="opt">(opcional)</span></label><textarea id="f-notas" name="notas" maxlength="300"></textarea></div>
        </fieldset>
        <fieldset class="fieldset"><legend>Medio de pago previsto</legend>
          ${CFG.payments.methods.map((m, i) => `<label class="radio"><input type="radio" name="paymentMethod" value="${m.id}" ${i === 0 ? 'checked' : ''} ${TRANSFER && m.status !== 'disponible' ? 'disabled' : ''}><span><strong>${m.label}</strong><span class="muted small">${m.status === 'disponible' ? 'Verás los datos de la cuenta al registrar tu pedido.' : (TRANSFER ? 'Próximamente.' : 'Pendiente de habilitación. Te contactaremos para coordinar el pago.')}</span></span></label>`).join('')}
          <p class="muted small" style="margin:0">No ofrecemos pago contra entrega. Este formulario no solicita datos de tarjeta.</p>
        </fieldset>
        <fieldset class="fieldset"><legend>Tratamiento de datos</legend>
          <label class="check"><input type="checkbox" name="aceptaTratamiento" id="f-acepta" required aria-describedby="e-acepta"><span>Autorizo a NUBIK a usar estos datos únicamente para gestionar mi pedido, contactarme sobre su pago, envío y garantía, y compartir los datos de entrega con el proveedor y la transportadora. He leído la <a class="link" href="/privacidad" target="_blank">política de privacidad</a>.</span></label>
          <div class="err" id="e-acepta"></div>
        </fieldset>
        <div class="hp" aria-hidden="true"><label for="f-empresa">Empresa</label><input id="f-empresa" name="empresa" type="text" tabindex="-1" autocomplete="off"></div>
        <div id="coErr"></div>
      </form>
      <aside class="summary" aria-label="Resumen del pedido">
        <h2>Tu pedido</h2>
        ${priced.lines.map(l => `<div class="sumrow"><span>${l.name} × ${l.qty}</span><strong>${money(l.lineTotal)}</strong></div>`).join('')}
        <div class="sumrow"><span>Envío</span><span class="free">Gratis</span></div>
        <div class="sumrow sumrow--total"><span>Total</span><span>${money(priced.total)} COP</span></div>
        <button class="btn btn--block" type="submit" form="coForm" id="coBtn" style="margin-top:14px">Registrar solicitud de pedido</button>
        <p class="muted small" style="margin-top:12px">Precios validados por la tienda. ${CFG.shipping.estimates.map(e => `${e.zone}: ${e.businessDays}`).join(' · ')} (estimado).</p>
      </aside>
    </div>`;

  const form = document.getElementById('coForm');
  const msgs = {
    nombre: 'Escribe tu nombre completo.', celular: 'Escribe un celular de 10 dígitos que empiece por 3.',
    email: 'Revisa el correo electrónico.', departamento: 'Selecciona tu departamento.',
    ciudad: 'Escribe tu ciudad o municipio.', direccion: 'Escribe la dirección de entrega.',
  };
  const check = el => {
    const err = document.getElementById('e-' + (el.name === 'aceptaTratamiento' ? 'acepta' : el.name));
    if (!err) return true;
    const ok = el.checkValidity();
    el.setAttribute('aria-invalid', String(!ok));
    err.textContent = ok ? '' : (el.name === 'aceptaTratamiento' ? 'Necesitamos tu autorización para registrar la solicitud.' : msgs[el.name] || 'Revisa este campo.');
    return ok;
  };
  form.addEventListener('blur', e => { if (e.target.name) check(e.target); }, true);
  let sending = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (sending) return;
    const els = [...form.querySelectorAll('input[name], select[name]')].filter(el => el.type !== 'radio');
    const bad = els.filter(el => !check(el));
    if (bad.length) { bad[0].focus(); return; }
    const fd = new FormData(form);
    const customer = {};
    ['nombre', 'celular', 'email', 'departamento', 'ciudad', 'direccion', 'detalle', 'notas'].forEach(k => customer[k] = String(fd.get(k) || '').trim());
    customer.aceptaTratamiento = form.aceptaTratamiento.checked;
    customer.empresa = String(fd.get('empresa') || '');
    const btn = document.getElementById('coBtn');
    sending = true;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Registrando…';
    document.getElementById('coErr').innerHTML = '';
    try {
      const res = await api('/api/orders', { items: cart.items, customer, paymentMethod: fd.get('paymentMethod') });
      const waText = cartWaText(res.priced, res.id);
      cart.clear();
      showResult(res, waText);
    } catch (err) {
      document.getElementById('coErr').innerHTML = `<div class="notice notice--err">${icon('alert')}<span>${escapeHtml(err.message)}</span></div>`;
      sending = false;
      btn.disabled = false; btn.textContent = 'Registrar solicitud de pedido';
    }
  });
}

function transferBox(t) {
  const row = (k, v, copy) => `<div class="bank__row"><span>${k}</span><strong>${escapeHtml(String(v))}</strong>${copy ? `<button type="button" class="bank__copy" data-copy="${escapeHtml(String(copy))}">Copiar</button>` : ''}</div>`;
  return `<div class="bank" aria-label="Datos para la transferencia">
    <h2 class="h3">Datos para tu transferencia</h2>
    ${row('Banco', t.bank)}${row('Tipo de cuenta', t.accountType)}${row('Número de cuenta', t.accountNumber, t.accountNumber.replace(/\D/g, ''))}
    ${row('Titular', t.holder)}${t.holderId ? row('Documento del titular', t.holderId) : ''}
    ${row('Valor a transferir', money(t.amount) + ' COP', t.amount)}${row('Referencia', t.reference, t.reference)}
    <p class="muted small" style="margin:12px 0 0">Tu pedido queda confirmado cuando NUBIK verifica el pago. Envíanos el comprobante por WhatsApp.</p>
  </div>`;
}

function showResult(res, waText) {
  document.getElementById('main').innerHTML = `
    <div class="wrap result">
      <div class="card">
        <span class="tag tag--nube">Solicitud registrada · ${res.transfer ? 'Pendiente de transferencia' : 'Pago pendiente'}</span>
        <h1 class="h2" style="margin-top:18px">Recibimos tu solicitud</h1>
        <p>Número de solicitud:</p>
        <div class="order-id">${escapeHtml(res.id)}</div>
        ${res.transfer ? transferBox(res.transfer) : `<div class="notice" style="margin-bottom:20px">${icon('info')}<span><strong>Tu pedido todavía no está pagado ni confirmado.</strong> ${escapeHtml(res.payment.message)}</span></div>`}
        <ol class="timeline">
          <li><b>1</b><strong>Solicitud recibida</strong><span>Registramos tus datos y productos (${money(res.priced.total)} COP, envío gratis).</span></li>
          <li><b>2</b><strong>Confirmación y pago</strong><span>${res.transfer ? 'Haz la transferencia y envíanos el comprobante por WhatsApp con tu número de solicitud.' : 'Escríbenos por WhatsApp con tu número de solicitud para coordinar el pago.'}</span></li>
          <li><b>3</b><strong>Preparación y despacho</strong><span>Una vez confirmado el pago, el pedido se prepara según los horarios de despacho.</span></li>
          <li><b>4</b><strong>Transporte y entrega</strong><span>Tiempo estimado: ${CFG.shipping.estimates.map(e => `${e.zone.toLowerCase()} ${e.businessDays}`).join('; ')}.</span></li>
        </ol>
        <a class="btn btn--block" href="${waLink(WA, waText)}" target="_blank" rel="noopener" style="margin-top:12px">${icon('chat')} Continuar por WhatsApp</a>
        <p class="muted small" style="margin-top:14px">Abrir WhatsApp no confirma el pedido: la confirmación la recibirás de NUBIK.</p>
      </div>
    </div>`;
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copiado'; } catch { b.textContent = 'Cópialo a mano'; }
  }));
  scrollTo(0, 0);
  document.title = 'Solicitud registrada | NUBIK';
}

views['/preguntas-frecuentes'] = () => `
  <section class="section" style="padding-top:48px">
    <div class="wrap center">
      <span class="eyebrow">Ayuda</span>
      <h1 class="h2">Preguntas frecuentes</h1>
      <p class="lead">Si no encuentras tu respuesta, escríbenos.</p>
      ${faqList(faqs(CFG, PRODUCTS))}
      <div class="btn-row" style="justify-content:center;margin-top:32px"><a class="btn btn--nube" href="${waGeneral()}" target="_blank" rel="noopener">${icon('chat')} Escríbenos por WhatsApp</a></div>
    </div>
  </section>`;

views['/envios-y-garantias'] = () => {
  const s = CFG.shipping, w = CFG.warranty;
  return `
  <section class="section" style="padding-top:48px">
    <div class="wrap">
      <span class="eyebrow">Envíos, despacho y garantía</span>
      <h1 class="h2" style="max-width:18ch">Así llega tu pedido a casa</h1>
      <p class="lead">Envío gratis a toda Colombia. Te contamos cada etapa con claridad.</p>
      ${trustCards()}
    </div>
  </section>
  <section class="section section--white">
    <div class="wrap">
      <h2 class="h3">Las etapas de tu pedido</h2>
      <ol class="timeline" style="max-width:720px">
        <li><b>1</b><strong>Recepción de la orden</strong><span>Registras tu solicitud en la web o por WhatsApp.</span></li>
        <li><b>2</b><strong>Confirmación del pedido</strong><span>NUBIK verifica el pago y te confirma el pedido.</span></li>
        <li><b>3</b><strong>Preparación</strong><span>El proveedor alista y empaca los productos.</span></li>
        <li><b>4</b><strong>Despacho</strong><span>Se genera la guía y el paquete se entrega a la transportadora, según los horarios de abajo.</span></li>
        <li><b>5</b><strong>Transporte</strong><span>${s.estimates.map(e => `${e.zone}: ${e.businessDays}`).join(' · ')} (estimado).</span></li>
        <li><b>6</b><strong>Entrega final</strong><span>La fecha exacta depende de la transportadora y no puede garantizarse.</span></li>
      </ol>
    </div>
  </section>
  <section class="section">
    <div class="wrap">
      <h2 class="h3">Horarios de despacho</h2>
      <div class="sched" style="margin-top:20px">${s.dispatchSchedule.map(d => `<div class="tcard">${icon('clock')}<h3>${d.day}</h3><p>${d.rule}</p></div>`).join('')}</div>
      <div class="notice notice--info" style="margin-top:18px">${icon('info')}<span>${s.scheduleDisclaimer}</span></div>
      <h2 class="h3" style="margin-top:56px">Empaque</h2>
      <div class="tcard" style="max-width:780px;margin-top:16px">${icon('box')}<p>${s.packaging}</p><p class="small" style="margin-top:10px">Estas prácticas las realiza el proveedor y ayudan a proteger el envío, pero no eliminan por completo el riesgo de daños durante el transporte.</p></div>
    </div>
  </section>
  <section class="section section--white" id="garantia">
    <div class="wrap prose">
      <span class="eyebrow">Garantía</span>
      <h2 class="h2">Cobertura de garantía</h2>
      <div class="review-banner">${icon('alert')}<div><strong>Política en confirmación.</strong> ${w.summary}</div></div>
      <h3>Lo que NUBIK está confirmando por escrito con el proveedor</h3>
      <ul>${w.pendingConfirmation.map(x => `<li>${x}</li>`).join('')}</ul>
      <h3>Tus derechos como consumidor</h3>
      <p>La cobertura comercial informada por el proveedor no limita los derechos de garantía legal y protección al consumidor que te correspondan en Colombia.</p>
      <h3>Cómo contactarnos</h3>
      <p>Si tu producto presenta un problema, escríbenos por WhatsApp al <a class="link" href="${waGeneral()}" target="_blank" rel="noopener">${CFG.contact.whatsappDisplay}</a> con tu número de solicitud (NBK-…), una descripción y fotos o video del producto. Te indicaremos el procedimiento.</p>
      ${CFG.contact.customerServiceEmail ? `<p>Correo de atención: <a class="link" href="mailto:${CFG.contact.customerServiceEmail}">${CFG.contact.customerServiceEmail}</a></p>` : ''}
      <p><a class="link" href="/cambios-y-devoluciones">Cambios y devoluciones</a></p>
    </div>
  </section>`;
};

for (const [path, key] of [['/privacidad', 'privacidad'], ['/terminos', 'terminos'], ['/cambios-y-devoluciones', 'cambios']]) {
  views[path] = () => { const L = legal(key, CFG, PRODUCTS); return `<section class="section" style="padding-top:48px"><div class="wrap prose"><span class="eyebrow">Legal</span><h1 class="h2">${L.title}</h1>${L.body}</div></section>`; };
}

const notFound = () => `
  <section class="section"><div class="wrap center">
    <span class="eyebrow">Error 404</span><h1 class="h2">Esta página no existe</h1>
    <p class="lead">Puede que el enlace haya cambiado.</p>
    <div class="btn-row" style="justify-content:center"><a class="btn" href="/">Ir al inicio</a><a class="btn btn--ghost" href="/combo-nubik">Ver el combo</a></div>
  </div></section>`;

const mounts = { '/': mountHero, '/carrito': mountCart, '/checkout': mountCheckout };

// ------------------------------------------------------------------ router
function setMeta(path) {
  const [title, desc] = SEO[path] || ['Página no encontrada | NUBIK', 'La página que buscas no existe.'];
  document.title = title;
  document.querySelector('meta[name="description"]').content = desc;
  document.querySelector('link[rel="canonical"]').href = location.origin + path;
  document.querySelector('meta[property="og:title"]').content = title;
  document.querySelector('meta[property="og:description"]').content = desc;
  document.querySelector('meta[property="og:url"]').content = location.origin + path;
}

function setFaqSchema(path) {
  document.getElementById('faq-ld')?.remove();
  if (path !== '/preguntas-frecuentes') return;
  const s = document.createElement('script');
  s.type = 'application/ld+json'; s.id = 'faq-ld';
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs(CFG, PRODUCTS).map(f => ({ '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } })) });
  document.head.appendChild(s);
}

let io, renderedPath = null;
function render(first = false) {
  const { path, anchor } = currentRoute();
  if (STATIC && path === renderedPath && anchor) {  // mismo view: solo desplazarse a la sección
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  renderedPath = path;
  const view = views[path] || notFound;
  const main = document.getElementById('main');
  main.innerHTML = view();
  document.body.classList.toggle('is-home', path === '/');
  if (!first && !STATIC) setMeta(path);
  if (STATIC && SEO[path]) document.title = path === '/' ? 'NUBIK Tienda' : SEO[path][0];
  setFaqSchema(path);
  if (!first) document.getElementById('jsonld').textContent = '[]';
  document.querySelectorAll('.nav__links a').forEach(a => {
    const h = a.dataset.path;
    if ((h === path && !(h === '/' && anchor)) || (h === '/' + '#' + anchor)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  bindView(main);
  mounts[path]?.();
  if (anchor) {
    const t = document.getElementById(anchor);
    if (t) setTimeout(() => t.scrollIntoView(), 0);
  } else if (!first) scrollTo(0, 0);
  if (!first) main.focus({ preventScroll: true });
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  main.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

function bindView(root) {
  let qty = 1;
  root.querySelectorAll('[data-qty]').forEach(q => {
    const out = q.querySelector('output');
    const minus = q.querySelector('[data-d="-1"]');
    const sync = () => {
      out.textContent = qty; minus.disabled = qty <= 1; q.querySelector('[data-d="1"]').disabled = qty >= MAXQ;
      root.querySelectorAll('[data-wa-product]').forEach(a => a.href = waProduct(a.dataset.waProduct, qty));
    };
    q.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; qty = Math.max(1, Math.min(MAXQ, qty + Number(b.dataset.d))); sync(); });
    sync();
  });
  root.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.add;
    if (cart.add(id, b.hasAttribute('data-with-qty') ? qty : 1)) toast(`${PRODUCTS[id].shortName} añadido al carrito`, true);
  }));
  const g = root.querySelector('[data-gallery]');
  if (g) g.addEventListener('click', e => {
    const b = e.target.closest('[data-img]'); if (!b) return;
    g.querySelectorAll('[data-img]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const main = g.querySelector('#gmain');
    main.classList.toggle('is-photo', b.dataset.photo === '1');
    main.innerHTML = img(b.dataset.img, b.dataset.alt, { sizes: '(min-width: 960px) 620px, 92vw' });
  });
}

if (STATIC) {
  // reescribe los enlaces internos "/ruta" a "#nombre" (el visor de la vista previa solo admite #nombre)
  const fix = root => root.querySelectorAll?.('a[href^="/"]').forEach(a => { a.setAttribute('href', staticHref(a.getAttribute('href'))); });
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches('a[href^="/"]')) n.setAttribute('href', staticHref(n.getAttribute('href'))); fix(n); } })))
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => fix(document));
  queueMicrotask(() => fix(document));
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a?.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === location.hash || (href === '#' && !location.hash)) {  // ya estamos ahí: no hay hashchange
      e.preventDefault();
      const sec = SECTION_ROUTE[href.slice(1)] ? document.getElementById(href.slice(1)) : null;
      if (sec) sec.scrollIntoView({ behavior: 'smooth' }); else scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  addEventListener('hashchange', () => render());
}

!STATIC && document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) return;
  if (a.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
  const target = url.pathname.replace(/\/+$/, '') || '/';
  if (target === '/productos/guante-quitapelos') { e.preventDefault(); history.pushState({}, '', '/combo-nubik'); return render(); }
  e.preventDefault();
  if (url.pathname === location.pathname && url.hash) {
    history.pushState({}, '', url.pathname + url.hash);
    document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  history.pushState({}, '', url.pathname + url.hash);
  render();
});
if (!STATIC) addEventListener('popstate', () => render());
addEventListener('storage', e => { if (e.key === 'nubik_cart_v1') { cart.items = sanitize(cartStore.get()?.items); renderBadge(false); } });

renderShell();
render(true);
