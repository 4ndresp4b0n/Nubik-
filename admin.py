"""
Panel privado de pedidos de NUBIK y aviso por correo de pedidos nuevos.

Panel:  /admin  (protegido con la contraseña de la variable de entorno NUBIK_ADMIN_PASSWORD;
        si no está definida, el panel queda desactivado).
Correo: opcional. Se envía un aviso por cada pedido nuevo si están definidas
        SMTP_HOST, SMTP_USER, SMTP_PASSWORD y NOTIFY_EMAIL (SMTP_PORT por defecto 465).

Solo usa la librería estándar.
"""
from __future__ import annotations

import base64
import html
import json
import os
import secrets
import smtplib
import ssl
import threading
import time
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote

COL_TZ = timezone(timedelta(hours=-5))
STATUSES = {
    "pendiente_pago": "Pendiente de pago",
    "pago_recibido": "Pago recibido",
    "despachado": "Despachado",
    "entregado": "Entregado",
    "cancelado": "Cancelado",
}
_lock = threading.Lock()
_fails: dict[str, list[float]] = {}
MAX_FAILS, FAIL_WINDOW = 10, 15 * 60


# ---------------------------------------------------------------- acceso
def password() -> str | None:
    pw = (os.environ.get("NUBIK_ADMIN_PASSWORD") or "").strip()
    return pw if len(pw) >= 10 else None


def password_problem() -> str | None:
    """Explica por qué el panel está desactivado, sin revelar la contraseña."""
    raw = os.environ.get("NUBIK_ADMIN_PASSWORD")
    if raw is None:
        parecidas = [k for k in os.environ if "ADMIN" in k.upper() or "PASSWORD" in k.upper()]
        extra = f" Variables con nombre parecido: {', '.join(repr(k) for k in parecidas)}." if parecidas else ""
        return "la variable NUBIK_ADMIN_PASSWORD no existe en el servidor." + extra
    if len(raw.strip()) < 10:
        return f"NUBIK_ADMIN_PASSWORD tiene {len(raw.strip())} caracteres; se necesitan al menos 10."
    return None


def locked_out(ip: str) -> bool:
    now = time.time()
    _fails[ip] = [t for t in _fails.get(ip, []) if now - t < FAIL_WINDOW]
    return len(_fails[ip]) >= MAX_FAILS


def check_auth(header: str | None, ip: str) -> bool:
    """Autenticación básica HTTP: cualquier usuario, contraseña = NUBIK_ADMIN_PASSWORD."""
    pw = password()
    if not pw or locked_out(ip):
        return False
    ok = False
    if header and header.startswith("Basic "):
        try:
            _, _, given = base64.b64decode(header[6:]).decode("utf-8").partition(":")
            ok = secrets.compare_digest(given.encode(), pw.encode())
        except (ValueError, UnicodeDecodeError):
            ok = False
    if not ok:
        _fails.setdefault(ip, []).append(time.time())
    return ok


# ---------------------------------------------------------------- datos
def load_orders(data_dir: Path) -> list[dict]:
    f = data_dir / "orders.jsonl"
    if not f.is_file():
        return []
    out = []
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    statuses = load_statuses(data_dir)
    for o in out:
        o["adminStatus"] = statuses.get(o["id"], {}).get("status", "pendiente_pago")
    return list(reversed(out))  # más recientes primero


def load_statuses(data_dir: Path) -> dict:
    f = data_dir / "order_status.json"
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else {}
    except json.JSONDecodeError:
        return {}


def set_status(data_dir: Path, order_id: str, status: str) -> bool:
    if status not in STATUSES:
        return False
    with _lock:
        if order_id not in {o["id"] for o in load_orders(data_dir)}:
            return False
        st = load_statuses(data_dir)
        st[order_id] = {"status": status, "updatedAt": datetime.now(COL_TZ).isoformat(timespec="seconds")}
        tmp = data_dir / "order_status.json.tmp"
        tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(data_dir / "order_status.json")
    return True


# ---------------------------------------------------------------- panel
def money(n) -> str:
    return "$" + f"{int(n):,}".replace(",", ".")


def e(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def render_panel(orders: list[dict], flash: str = "") -> str:
    pending = sum(1 for o in orders if o["adminStatus"] == "pendiente_pago")
    paid = sum(1 for o in orders if o["adminStatus"] == "pago_recibido")
    cards = "".join(order_card(o) for o in orders) or '<p class="empty">Todavía no hay pedidos.</p>'
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="60">
<title>{f'({pending}) ' if pending else ''}Pedidos NUBIK</title>
<link rel="icon" href="/assets/img/marca/nubik-icon-32.png">
<style>
:root{{--nube:#7EC4EF;--noche:#1F3A5F;--rosa:#F6A5B5;--crema:#FBF8F3;--gris:#5B6678}}
*{{box-sizing:border-box}} body{{margin:0;font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;background:var(--crema);color:var(--noche)}}
header{{background:var(--noche);color:#fff;padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}}
header img{{height:34px}} header h1{{font-size:20px;margin:0;flex:1}}
.stats{{display:flex;gap:10px;flex-wrap:wrap}} .stat{{background:rgba(255,255,255,.12);border-radius:10px;padding:6px 12px;font-weight:700}}
main{{max-width:980px;margin:0 auto;padding:20px 16px 60px}}
.note{{color:var(--gris);font-size:13px;margin:0 0 16px}} .flash{{background:#E6F4EA;border-radius:10px;padding:10px 14px;margin-bottom:16px}}
.card{{background:#fff;border-radius:16px;padding:18px;margin-bottom:14px;box-shadow:0 2px 10px rgba(31,58,95,.08);border-left:6px solid var(--nube)}}
.card.s-pendiente_pago{{border-left-color:var(--rosa)}} .card.s-cancelado{{opacity:.6}}
.top{{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between}}
.id{{font-weight:800;font-size:17px}} .date{{color:var(--gris);font-size:13px}}
.badge{{border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800;background:#EAF5FC}}
.s-pendiente_pago .badge{{background:#FDE7EC}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px}} @media(max-width:700px){{.grid{{grid-template-columns:1fr}}}}
h3{{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--gris);margin:0 0 4px}}
ul{{margin:0;padding-left:18px}} .total{{font-weight:800;font-size:16px}} .muted{{color:var(--gris);font-size:13px}}
.actions{{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px}}
select,button,a.wa{{font:inherit;border-radius:999px;padding:7px 14px;border:1.5px solid var(--noche);background:#fff;color:var(--noche)}}
button{{background:var(--noche);color:#fff;cursor:pointer;font-weight:700}} a.wa{{text-decoration:none;font-weight:700;border-color:#25D366;color:#128C4A}}
.empty{{text-align:center;color:var(--gris);padding:40px}}
</style></head><body>
<header><img src="/assets/img/marca/nubik-logo-claro.png" alt="NUBIK"><h1>Pedidos</h1>
<div class="stats"><span class="stat">Pendientes de pago: {pending}</span><span class="stat">Pagados por despachar: {paid}</span><span class="stat">Total: {len(orders)}</span></div></header>
<main>
{f'<div class="flash">{e(flash)}</div>' if flash else ''}
<p class="note">Esta página se actualiza sola cada minuto. El número entre paréntesis en la pestaña indica los pedidos pendientes de pago. Marca "Pago recibido" solo después de ver el dinero en la cuenta.</p>
{cards}
</main></body></html>"""


def order_card(o: dict) -> str:
    c = o.get("customer", {})
    p = o.get("priced", {})
    st = o["adminStatus"]
    created = o.get("createdAt", "")[:16].replace("T", " ")
    items = "".join(f"<li>{e(l['name'])} × {e(l['qty'])} — {money(l['lineTotal'])}</li>" for l in p.get("lines", []))
    method = {"transferencia": "Transferencia", "tarjeta": "Tarjeta"}.get(o.get("paymentMethodRequested"), o.get("paymentMethodRequested"))
    wa_text = (f"Hola {c.get('nombre', '').split(' ')[0]}, te escribe NUBIK sobre tu pedido {o['id']} "
               f"por {money(p.get('total', 0))} COP.")
    wa = f"https://wa.me/57{c.get('celular', '')}?text={quote(wa_text)}"
    internal = o.get("internal") or {}
    options = "".join(f'<option value="{k}"{" selected" if k == st else ""}>{v}</option>' for k, v in STATUSES.items())
    addr = ", ".join(x for x in [c.get("direccion"), c.get("detalle"), c.get("ciudad"), c.get("departamento")] if x)
    return f"""<article class="card s-{e(st)}">
<div class="top"><div><div class="id">{e(o['id'])}</div><div class="date">{e(created)}</div></div>
<span class="badge">{e(STATUSES.get(st, st))}</span></div>
<div class="grid">
<div><h3>Productos</h3><ul>{items}</ul><p class="total">Total: {money(p.get('total', 0))} COP <span class="muted">· envío gratis · {e(method)}</span></p>
{f'<p class="muted">Margen estimado: {money(internal["marginBeforeOtherExpenses"])} (antes de pasarela, impuestos y otros gastos)</p>' if "marginBeforeOtherExpenses" in internal else ''}</div>
<div><h3>Cliente</h3><p style="margin:0"><strong>{e(c.get('nombre'))}</strong><br>Cel. {e(c.get('celular'))}{('<br>' + e(c.get('email'))) if c.get('email') else ''}</p>
<h3 style="margin-top:10px">Entrega</h3><p style="margin:0">{e(addr)}</p>
{f'<p class="muted">Notas: {e(c.get("notas"))}</p>' if c.get('notas') else ''}</div>
</div>
<form class="actions" method="post" action="/admin/estado">
<input type="hidden" name="id" value="{e(o['id'])}">
<label class="muted" for="st-{e(o['id'])}">Estado</label><select id="st-{e(o['id'])}" name="status">{options}</select>
<button type="submit">Guardar</button>
<a class="wa" href="{e(wa)}" target="_blank" rel="noopener">Escribir por WhatsApp</a>
</form></article>"""


# ---------------------------------------------------------------- correo
def email_configured() -> bool:
    return all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "NOTIFY_EMAIL"))


def build_email(order: dict, site_url: str) -> EmailMessage:
    c, p = order["customer"], order["priced"]
    lines = "\n".join(f"  • {l['name']} x{l['qty']} — {money(l['lineTotal'])}" for l in p["lines"])
    msg = EmailMessage()
    msg["Subject"] = f"Nuevo pedido {order['id']} — {money(p['total'])} COP"
    msg["From"] = os.environ.get("SMTP_FROM") or os.environ["SMTP_USER"]
    msg["To"] = os.environ["NOTIFY_EMAIL"]
    msg.set_content(
        f"Nuevo pedido en la tienda NUBIK\n\n"
        f"Pedido: {order['id']}\nFecha: {order['createdAt']}\n"
        f"Pago: {order.get('paymentMethodRequested')} (pendiente de verificar)\n\n"
        f"Productos:\n{lines}\nTotal: {money(p['total'])} COP (envío gratis)\n\n"
        f"Cliente: {c['nombre']}\nCelular: {c['celular']}\n"
        f"Entrega: {c['direccion']} {c.get('detalle', '')}, {c['ciudad']}, {c['departamento']}\n"
        f"{('Notas: ' + c['notas']) if c.get('notas') else ''}\n\n"
        f"Gestiona el pedido en {site_url}/admin\n"
    )
    return msg


def _send(msg: EmailMessage):
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "465"))
    ctx = ssl.create_default_context()
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
                s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"]); s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as s:
                s.starttls(context=ctx); s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"]); s.send_message(msg)
        print("Aviso de pedido enviado por correo")
    except Exception as exc:  # no detiene la tienda si el correo falla
        print("No se pudo enviar el aviso por correo:", type(exc).__name__)


def notify_new_order(order: dict, site_url: str, background: bool = True):
    if not email_configured():
        return False
    msg = build_email(order, site_url)
    if background:
        threading.Thread(target=_send, args=(msg,), daemon=True).start()
    else:
        _send(msg)
    return True
