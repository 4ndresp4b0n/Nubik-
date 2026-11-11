"""
Servidor de la tienda NUBIK.

- Sirve el frontend (public/) con metadatos SEO por ruta renderizados en el servidor.
- Expone una API mínima que recalcula SIEMPRE los precios desde config/business.json
  (nunca confía en precios enviados por el navegador).
- Registra solicitudes de pedido en data/orders.jsonl con estado "pendiente de pago".
  No procesa pagos: la pasarela está pendiente de integración (ver payments.py).

Solo usa la librería estándar de Python 3.10+.
Uso:  python server.py            (por defecto http://127.0.0.1:8000)
Variables: PORT, HOST, SITE_URL, NUBIK_DATA_DIR
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import threading
from datetime import datetime, timezone, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import admin
import antispam
import payments

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
CONFIG_PATH = ROOT / "config" / "business.json"
DATA_DIR = Path(os.environ.get("NUBIK_DATA_DIR", ROOT / "data"))
SITE_URL = os.environ.get("SITE_URL", "http://127.0.0.1:8000").rstrip("/")
COL_TZ = timezone(timedelta(hours=-5))
MAX_BODY = 16 * 1024
_orders_lock = threading.Lock()

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")


# ---------------------------------------------------------------- configuración
PRIVATE_CONFIG_PATH = Path(os.environ.get("NUBIK_PRIVATE_CONFIG", ROOT / "config" / "private.json"))
ENV_OVERRIDES = {  # variable de entorno -> ruta dentro de la configuración
    "BANK_NAME": ("bankTransfer", "bank"),
    "BANK_ACCOUNT_TYPE": ("bankTransfer", "accountType"),
    "BANK_ACCOUNT_NUMBER": ("bankTransfer", "accountNumber"),
    "BANK_HOLDER": ("bankTransfer", "holder"),
    "BANK_HOLDER_ID": ("bankTransfer", "holderId"),
    "COSTO_PELOTA": ("internal", "supplierCosts", "pelota-interactiva"),
    "COSTO_GUANTE": ("internal", "supplierCosts", "guante-quitapelos"),
    "FLETE_ESTIMADO": ("internal", "estimatedFreightPerOrder"),
}


def _merge(base: dict, extra: dict):
    for k, v in extra.items():
        if k.startswith("_"):
            continue
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v


def load_config() -> dict:
    """Configuración pública del repositorio + datos privados (config/private.json y variables de entorno)."""
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        cfg = json.load(fh)
    if PRIVATE_CONFIG_PATH.is_file():
        with open(PRIVATE_CONFIG_PATH, encoding="utf-8") as fh:
            _merge(cfg, json.load(fh))
    for var, path in ENV_OVERRIDES.items():
        val = os.environ.get(var)
        if not val:
            continue
        node = cfg
        for key in path[:-1]:
            node = node.setdefault(key, {})
        node[path[-1]] = int(val) if path[0] == "internal" and val.isdigit() else val
    return cfg


def logo_available(cfg: dict) -> bool:
    src = cfg["public"]["brand"]["logoSrc"].lstrip("/")
    return (PUBLIC / src).is_file()


def transfer_info(cfg: dict):
    """Datos de transferencia completos, o None si falta banco o titular. Nunca van en las páginas públicas."""
    t = cfg.get("bankTransfer") or {}
    if not all(t.get(k) for k in ("bank", "accountType", "accountNumber", "holder")):
        return None
    return {k: t[k] for k in ("bank", "accountType", "accountNumber", "holder", "holderId") if t.get(k)}


def public_bootstrap(cfg: dict) -> dict:
    """Datos que el navegador puede ver. Excluye costos, márgenes, inventario y contacto del proveedor."""
    products = {}
    for pid, p in cfg["products"].items():
        products[pid] = {
            "id": pid,
            "sku": p["sku"],
            "name": p["name"],
            "shortName": p["shortName"],
            "path": p["path"],
            "type": p["type"],
            "sellableAlone": bool(p["sellableAlone"]),
            "price": p["price"] if p["sellableAlone"] else None,
            "image": p["image"],
            "includes": p.get("includes", []),
            "availability": availability_label(cfg, pid),
        }
    pub = json.loads(json.dumps(cfg["public"]))
    pub["brand"]["logoAvailable"] = logo_available(cfg)
    ready = transfer_info(cfg) is not None
    pub["payments"]["transferReady"] = ready
    for m in pub["payments"]["methods"]:
        if m["id"] == "transferencia" and ready:
            m["status"] = "disponible"
    return {"config": pub, "products": products, "seo": {k: list(v) for k, v in ROUTES.items()}}


def availability_label(cfg: dict, pid: str) -> str:
    inv = cfg["internal"]["inventory"]
    needed = component_units(cfg, pid, 1)
    if any(inv.get(k) is None for k in needed):
        return "por_confirmar"
    return "disponible" if all(inv[k] >= n for k, n in needed.items()) else "agotado"


def component_units(cfg: dict, pid: str, qty: int) -> dict[str, int]:
    p = cfg["products"][pid]
    if p["type"] == "bundle":
        return {c["id"]: c["qty"] * qty for c in p["includes"]}
    return {pid: qty}


# ---------------------------------------------------------------- precios
class OrderError(ValueError):
    pass


def price_cart(cfg: dict, items) -> dict:
    """Recalcula el carrito desde la configuración. Lanza OrderError si algo no es válido."""
    if not isinstance(items, list) or not items:
        raise OrderError("El carrito está vacío.")
    if len(items) > 10:
        raise OrderError("Demasiadas líneas en el carrito.")
    max_qty = int(cfg["public"]["limits"]["maxQtyPerItem"])
    merged: dict[str, int] = {}
    for it in items:
        if not isinstance(it, dict):
            raise OrderError("Formato de carrito inválido.")
        pid, qty = it.get("id"), it.get("qty")
        if not isinstance(pid, str) or pid not in cfg["products"]:
            raise OrderError("Producto no disponible.")
        prod = cfg["products"][pid]
        if not prod["sellableAlone"] or prod["price"] is None:
            raise OrderError(f"{prod['shortName']} no se vende individualmente. Está incluido en el Combo NUBIK.")
        if isinstance(qty, bool) or not isinstance(qty, int) or qty < 1:
            raise OrderError("Cantidad inválida.")
        merged[pid] = merged.get(pid, 0) + qty
    lines, units = [], {}
    for pid, qty in merged.items():
        if qty > max_qty:
            raise OrderError(f"La cantidad máxima por producto es {max_qty}.")
        prod = cfg["products"][pid]
        lines.append({
            "id": pid, "sku": prod["sku"], "name": prod["name"], "qty": qty,
            "unitPrice": prod["price"], "lineTotal": prod["price"] * qty,
        })
        for k, n in component_units(cfg, pid, qty).items():
            units[k] = units.get(k, 0) + n
    inv = cfg["internal"]["inventory"]
    for k, n in units.items():
        if inv.get(k) is not None and inv[k] < n:
            raise OrderError(f"No hay unidades suficientes de {cfg['products'][k]['shortName']}.")
    subtotal = sum(l["lineTotal"] for l in lines)
    shipping = int(cfg["public"]["shipping"]["customerPrice"])  # siempre 0 para el cliente
    return {"lines": lines, "subtotal": subtotal, "shipping": shipping,
            "total": subtotal + shipping, "currency": "COP"}


def internal_margin(cfg: dict, priced: dict) -> dict:
    """Solo uso interno (tools/margenes.py y registro de pedidos). No se envía al cliente."""
    costs = cfg["internal"].get("supplierCosts") or {}
    freight = cfg["internal"].get("estimatedFreightPerOrder")
    if freight is None or any(costs.get(k) is None for k in ("pelota-interactiva", "guante-quitapelos")):
        return {}  # costos no configurados: no se calcula margen
    product_cost = 0
    for line in priced["lines"]:
        for k, n in component_units(cfg, line["id"], line["qty"]).items():
            product_cost += costs[k] * n
    return {"productCost": product_cost, "estimatedFreight": freight,
            "marginBeforeOtherExpenses": priced["total"] - product_cost - freight}


# ---------------------------------------------------------------- pedidos
FIELD_RULES = {
    "nombre": (3, 80), "celular": (10, 10), "email": (0, 120), "departamento": (3, 60),
    "ciudad": (2, 60), "direccion": (6, 160), "detalle": (0, 120), "notas": (0, 300),
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def clean_customer(raw) -> dict:
    if not isinstance(raw, dict):
        raise OrderError("Datos de envío inválidos.")
    out = {}
    for field, (lo, hi) in FIELD_RULES.items():
        val = raw.get(field, "")
        if not isinstance(val, str):
            raise OrderError(f"Campo inválido: {field}.")
        val = " ".join(val.split())
        if len(val) < lo or len(val) > hi:
            raise OrderError(f"Revisa el campo {field}.")
        out[field] = val
    if not re.fullmatch(r"3\d{9}", out["celular"]):
        raise OrderError("El celular debe tener 10 dígitos y empezar por 3.")
    if out["email"] and not EMAIL_RE.match(out["email"]):
        raise OrderError("El correo no es válido.")
    if raw.get("aceptaTratamiento") is not True:
        raise OrderError("Debes autorizar el tratamiento de datos para registrar la solicitud.")
    return out


def create_order(cfg: dict, body: dict) -> dict:
    priced = price_cart(cfg, body.get("items"))
    customer = clean_customer(body.get("customer"))
    method = body.get("paymentMethod")
    valid_methods = {m["id"] for m in cfg["public"]["payments"]["methods"]}
    if method not in valid_methods:
        raise OrderError("Selecciona un medio de pago previsto.")
    now = datetime.now(COL_TZ)
    order_id = f"NBK-{now:%y%m%d}-{secrets.token_hex(3).upper()}"
    record = {
        "id": order_id,
        "createdAt": now.isoformat(timespec="seconds"),
        "status": "solicitud_recibida",
        "paymentStatus": "pendiente",
        "paymentMethodRequested": method,
        "paymentProvider": payments.provider_name(),
        "priced": priced,
        "customer": customer,
        "internal": internal_margin(cfg, priced),
    }
    transfer = transfer_info(cfg) if method == "transferencia" else None
    if transfer:
        record["paymentInstructions"] = "transferencia"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _orders_lock, open(DATA_DIR / "orders.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    admin.notify_new_order(record, SITE_URL)  # aviso por correo, si está configurado
    return {"id": order_id, "status": record["status"], "paymentStatus": "pendiente",
            "payment": payments.start_payment(record), "priced": priced,
            "transfer": ({**transfer, "amount": priced["total"], "reference": order_id} if transfer else None)}


# ---------------------------------------------------------------- rutas y SEO
ROUTES = {
    "/": ("NUBIK | Pelota interactiva para gatos y productos para mascotas en Colombia",
          "Pelota interactiva para gatos con movimiento automático y tres modos, y el Combo NUBIK con guante quitapelos. Envío gratis en Colombia."),
    "/productos/pelota-interactiva": ("Pelota interactiva para gatos NUBIK | $59.900 COP, envío gratis",
          "Juguete para gatos que se mueve solo, con tres modos de funcionamiento. Recargable, cargador incluido en la caja. Envío gratis en Colombia."),
    "/combo-nubik": ("Combo NUBIK: pelota interactiva + guante quitapelos | $89.900 COP",
          "Pelota interactiva para gatos y guante quitapelos para perros y gatos en un solo combo. Envío gratis a toda Colombia."),
    "/carrito": ("Carrito | NUBIK", "Revisa los productos de tu carrito NUBIK."),
    "/checkout": ("Finalizar pedido | NUBIK", "Registra tu solicitud de pedido NUBIK."),
    "/preguntas-frecuentes": ("Preguntas frecuentes | NUBIK",
          "Resolvemos tus dudas sobre la pelota interactiva, el guante quitapelos, envíos, pagos y garantía."),
    "/envios-y-garantias": ("Envíos, despacho y garantía | NUBIK",
          "Envío gratis en Colombia, tiempos estimados de entrega, horarios de despacho y cobertura de garantía."),
    "/privacidad": ("Política de privacidad | NUBIK", "Cómo trata NUBIK tus datos personales."),
    "/terminos": ("Términos y condiciones | NUBIK", "Términos y condiciones de compra en NUBIK."),
    "/cambios-y-devoluciones": ("Cambios y devoluciones | NUBIK", "Política de cambios y devoluciones de NUBIK."),
}
NOINDEX = {"/carrito", "/checkout"}
REDIRECTS = {
    "/productos/guante-quitapelos": "/combo-nubik",
    "/productos/guante": "/combo-nubik",
    "/guante-quitapelos": "/combo-nubik",
    "/productos": "/#productos",
    "/combo": "/combo-nubik",
}


def json_ld(cfg: dict, path: str) -> list:
    org = {"@context": "https://schema.org", "@type": "Organization", "name": "NUBIK",
           "url": SITE_URL + "/", "slogan": cfg["public"]["brand"]["slogan"],
           "contactPoint": {"@type": "ContactPoint", "telephone": "+57-318-452-6653",
                            "contactType": "customer service", "areaServed": "CO",
                            "availableLanguage": "es"}}
    data = [org] if path == "/" else []
    pid = {"/productos/pelota-interactiva": "pelota-interactiva", "/combo-nubik": "combo-nubik"}.get(path)
    if pid:
        p = cfg["products"][pid]
        offer = {"@type": "Offer", "price": str(p["price"]), "priceCurrency": "COP",
                 "url": SITE_URL + p["path"],
                 "shippingDetails": {"@type": "OfferShippingDetails",
                                     "shippingRate": {"@type": "MonetaryAmount", "value": "0", "currency": "COP"},
                                     "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "CO"}}}
        av = availability_label(cfg, pid)
        if av != "por_confirmar":  # no se declara stock que no ha sido informado
            offer["availability"] = "https://schema.org/InStock" if av == "disponible" else "https://schema.org/OutOfStock"
        data.append({"@context": "https://schema.org", "@type": "Product", "name": p["name"],
                     "sku": p["sku"], "brand": {"@type": "Brand", "name": "NUBIK"},
                     "image": [SITE_URL + p["image"]], "description": ROUTES[path][1], "offers": offer})
    if path == "/preguntas-frecuentes":
        pass  # el FAQPage se genera en el cliente a partir del mismo contenido
    return data


def safe_json_for_html(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/").replace("<!--", "<\\!--")


def render_index(cfg: dict, path: str, status_title=None) -> str:
    html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    title, desc = ROUTES.get(path, ("Página no encontrada | NUBIK", "La página que buscas no existe."))
    image = SITE_URL + "/assets/img/productos/pelota-gato-juego-960.webp"
    robots = "noindex, nofollow" if path in NOINDEX or path not in ROUTES else "index, follow"
    repl = {
        "{{TITLE}}": esc(title), "{{DESCRIPTION}}": esc(desc), "{{CANONICAL}}": esc(SITE_URL + path),
        "{{OG_IMAGE}}": esc(image), "{{ROBOTS}}": robots,
        "{{JSONLD}}": safe_json_for_html(json_ld(cfg, path)),
        "{{BOOT}}": safe_json_for_html(public_bootstrap(cfg)),
    }
    for k, v in repl.items():
        html = html.replace(k, v)
    return html


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def sitemap() -> str:
    urls = [p for p in ROUTES if p not in NOINDEX]
    body = "".join(f"<url><loc>{SITE_URL}{p}</loc></url>" for p in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'


# ---------------------------------------------------------------- HTTP
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data:; media-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    ),
}


TOO_MANY = "Recibimos muchas solicitudes seguidas. Espera unos minutos o escríbenos por WhatsApp para hacer tu pedido."
ADMIN_HEADERS = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"}


class Handler(BaseHTTPRequestHandler):
    server_version = "NUBIK"
    sys_version = ""

    def log_message(self, fmt, *args):  # registro sin datos personales
        print(f"[{datetime.now(COL_TZ):%H:%M:%S}] {self.command} {urlsplit(self.path).path} -> {args[1] if len(args) > 1 else ''}")

    def send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in {**SECURITY_HEADERS, **(extra or {})}.items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status: int, obj):
        self.send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                  "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlsplit(self.path).path
        if len(path) > 1 and path.endswith("/"):
            path = path.rstrip("/")
        cfg = load_config()
        if path == "/api/catalog":
            return self.send_json(200, public_bootstrap(cfg))
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "paymentsEnabled": payments.enabled()})
        if path in REDIRECTS:
            self.send_response(301)
            self.send_header("Location", REDIRECTS[path])
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/sitemap.xml":
            return self.send(200, sitemap().encode(), "application/xml; charset=utf-8")
        if path == "/robots.txt":
            txt = f"User-agent: *\nDisallow: /carrito\nDisallow: /checkout\nDisallow: /api/\nDisallow: /admin\nSitemap: {SITE_URL}/sitemap.xml\n"
            return self.send(200, txt.encode(), "text/plain; charset=utf-8")
        if path.startswith("/assets/") or path == "/favicon.svg":
            return self.serve_static(path)
        if path == "/admin":
            if not self.admin_ok():
                return
            q = parse_qs(urlsplit(self.path).query)
            flash = f"Estado guardado para {q['ok'][0]}." if q.get("ok") else ""
            return self.send(200, admin.render_panel(admin.load_orders(DATA_DIR), flash).encode("utf-8"),
                             "text/html; charset=utf-8", ADMIN_HEADERS)
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "No encontrado"})
        status = 200 if path in ROUTES else 404
        body = render_index(cfg, path).encode("utf-8")
        self.send(status, body, "text/html; charset=utf-8", {"Cache-Control": "no-cache"})

    def serve_static(self, path: str):
        target = (PUBLIC / path.lstrip("/")).resolve()
        if PUBLIC.resolve() not in target.parents or not target.is_file():
            return self.send(404, b"Not found", "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        cache = "public, max-age=604800" if ("/img/" in path or "/video/" in path) else "no-cache"
        data = target.read_bytes()
        rng = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "") or "")
        if rng and (rng.group(1) or rng.group(2)):  # rangos: necesarios para video en Safari/iOS
            size = len(data)
            if rng.group(1):
                start = int(rng.group(1)); end = int(rng.group(2)) if rng.group(2) else size - 1
            else:
                start = max(0, size - int(rng.group(2))); end = size - 1
            end = min(end, size - 1)
            if start > end:
                return self.send(416, b"", ctype, {"Content-Range": f"bytes */{size}"})
            return self.send(206, data[start:end + 1], ctype, {"Cache-Control": cache, "Accept-Ranges": "bytes",
                                                              "Content-Range": f"bytes {start}-{end}/{size}"})
        self.send(200, data, ctype, {"Cache-Control": cache, "Accept-Ranges": "bytes"})

    def admin_ok(self) -> bool:
        """Envía la respuesta de error y devuelve False si no hay acceso al panel."""
        if not admin.password():
            self.send(503, "Panel desactivado: define la variable de entorno NUBIK_ADMIN_PASSWORD (mínimo 10 caracteres).".encode(),
                      "text/plain; charset=utf-8", ADMIN_HEADERS)
            return False
        ip = self.client_address[0]
        if admin.locked_out(ip):
            self.send(429, "Demasiados intentos. Espera 15 minutos.".encode(), "text/plain; charset=utf-8", ADMIN_HEADERS)
            return False
        if not admin.check_auth(self.headers.get("Authorization"), ip):
            self.send(401, "Acceso restringido".encode(), "text/plain; charset=utf-8",
                      {**ADMIN_HEADERS, "WWW-Authenticate": 'Basic realm="Pedidos NUBIK", charset="UTF-8"'})
            return False
        return True

    def client_ip(self) -> str:
        """IP del cliente. Detrás del proxy del hosting (TRUST_PROXY=1) usa la última IP de X-Forwarded-For."""
        if os.environ.get("TRUST_PROXY") == "1":
            xff = [x.strip() for x in (self.headers.get("X-Forwarded-For") or "").split(",") if x.strip()]
            if xff:
                return xff[-1]
        return self.client_address[0]

    def same_origin(self) -> bool:
        """Protección CSRF del panel: el formulario debe venir de este mismo sitio."""
        if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin"):
            return False
        origin = self.headers.get("Origin")
        return bool(origin) and urlsplit(origin).netloc == (self.headers.get("Host") or "")

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY:
            raise OrderError("Solicitud inválida.")
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise OrderError("Solicitud inválida.")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise OrderError("Solicitud inválida.")

    def do_POST(self):
        path = urlsplit(self.path).path
        cfg = load_config()
        try:
            if path == "/api/cart/quote":
                if not antispam.allow("quote", self.client_ip()):
                    return self.send_json(429, {"error": TOO_MANY})
                body = self.read_json()
                return self.send_json(200, price_cart(cfg, body.get("items") if isinstance(body, dict) else None))
            if path == "/api/orders":
                body = self.read_json()
                if not isinstance(body, dict):
                    raise OrderError("Solicitud inválida.")
                if not antispam.allow("order-ip", self.client_ip()):
                    return self.send_json(429, {"error": TOO_MANY})
                if antispam.is_bot(body):
                    raise OrderError("Solicitud inválida.")
                key = antispam.order_key(body)
                previous = antispam.recent_order(key)
                if previous:  # doble clic o reenvío: devuelve el pedido ya registrado
                    return self.send_json(200, previous)
                tel = str((body.get("customer") or {}).get("celular", "")) if isinstance(body.get("customer"), dict) else ""
                if tel and not antispam.allow("order-tel", tel, count=False):
                    return self.send_json(429, {"error": TOO_MANY})
                res = create_order(cfg, body)
                antispam.allow("order-tel", tel)
                antispam.remember(key, res)
                return self.send_json(201, res)
            if path == "/admin/estado":
                if not self.admin_ok():
                    return
                if not self.same_origin():
                    return self.send(403, "Origen no permitido".encode(), "text/plain; charset=utf-8", ADMIN_HEADERS)
                try:
                    length = int(self.headers.get("Content-Length") or 0)
                except ValueError:
                    length = -1
                if length <= 0 or length > MAX_BODY:
                    raise OrderError("Solicitud inválida.")
                form = parse_qs(self.rfile.read(length).decode("utf-8", "replace"))
                oid, st = (form.get("id") or [""])[0], (form.get("status") or [""])[0]
                if not admin.set_status(DATA_DIR, oid, st):
                    return self.send(400, "Pedido o estado no válido".encode(), "text/plain; charset=utf-8", ADMIN_HEADERS)
                self.send_response(303)
                self.send_header("Location", "/admin?ok=" + oid)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path == "/api/payments/webhook":
                return self.send_json(501, {"error": "Pasarela de pagos no configurada."})
        except OrderError as exc:
            return self.send_json(400, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            print("ERROR", type(exc).__name__, exc)
            return self.send_json(500, {"error": "Error interno. Intenta de nuevo o escríbenos por WhatsApp."})
        return self.send_json(404, {"error": "No encontrado"})


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8000"))
    if host == "0.0.0.0":  # producción: avisos de configuración incompleta (sin datos personales)
        if SITE_URL.startswith(("http://127.0.0.1", "http://localhost")):
            print("AVISO: define SITE_URL con tu dominio (p. ej. https://nubik.com.co) para Google, el sitemap y las redes.")
        if not admin.password():
            print("AVISO: panel de pedidos desactivado; define NUBIK_ADMIN_PASSWORD.")
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            (DATA_DIR / ".escritura").write_text("ok", encoding="utf-8")
        except OSError:
            print(f"AVISO: no se puede escribir en {DATA_DIR}; los pedidos no se guardarían.")
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"NUBIK en http://{host}:{port}  (pagos online: {'activos' if payments.enabled() else 'pendientes'})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
