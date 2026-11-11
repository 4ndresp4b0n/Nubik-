"""
Protección del formulario de pedidos contra spam, bots y envíos duplicados.

- Límite de solicitudes por conexión (IP) y de pedidos nuevos por número de celular.
- Campo trampa ("empresa"): invisible para personas; los bots que lo llenan son rechazados.
- Pedidos repetidos (mismo celular, productos y medio de pago en pocos minutos, p. ej. doble clic)
  devuelven el pedido ya registrado en lugar de crear otro.

Todo en memoria: se reinicia al reiniciar el servidor (suficiente para una tienda pequeña).
"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_hits: dict[tuple[str, str], list[float]] = {}
_recent: dict[str, tuple[float, dict]] = {}

LIMITS = {
    "quote": (120, 60),         # cotizaciones del carrito por IP: 120 por minuto
    "order-ip": (20, 3600),     # intentos de pedido por IP: 20 por hora (redes móviles comparten IP)
    "order-tel": (3, 3600),     # pedidos nuevos por celular: 3 por hora
}
DUPLICATE_WINDOW = 10 * 60
HONEYPOT_FIELD = "empresa"


def allow(kind: str, key: str, count: bool = True) -> bool:
    """True si la acción está dentro del límite. Con count=True la registra."""
    limit, window = LIMITS[kind]
    now = time.time()
    with _lock:
        hits = [t for t in _hits.get((kind, key), []) if now - t < window]
        ok = len(hits) < limit
        if ok and count:
            hits.append(now)
        _hits[(kind, key)] = hits
        if len(_hits) > 50_000:  # evita crecer sin límite
            _hits.clear()
    return ok


def is_bot(body: dict) -> bool:
    customer = body.get("customer") if isinstance(body, dict) else None
    return isinstance(customer, dict) and bool(str(customer.get(HONEYPOT_FIELD) or "").strip())


def order_key(body: dict) -> str | None:
    try:
        tel = str(body["customer"]["celular"]).strip()
        items = sorted((str(i["id"]), int(i["qty"])) for i in body["items"])
        return f"{tel}|{items}|{body.get('paymentMethod')}"
    except (KeyError, TypeError, ValueError):
        return None


def recent_order(key: str | None) -> dict | None:
    if not key:
        return None
    with _lock:
        hit = _recent.get(key)
        if hit and time.time() - hit[0] < DUPLICATE_WINDOW:
            return hit[1]
        _recent.pop(key, None)
    return None


def remember(key: str | None, response: dict):
    if key:
        with _lock:
            if len(_recent) > 5_000:
                _recent.clear()
            _recent[key] = (time.time(), response)


def reset():
    with _lock:
        _hits.clear()
        _recent.clear()
