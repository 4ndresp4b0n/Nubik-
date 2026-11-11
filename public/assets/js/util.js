export const money = n => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function waLink(number, text) {
  return `https://wa.me/${number}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

export function store(key) {
  return {
    get() { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } },
  };
}
