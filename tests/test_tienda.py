"""Pruebas de reglas comerciales y API.  Ejecutar:  python -m unittest discover -s tests -v"""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
TMP = tempfile.mkdtemp()
os.environ["NUBIK_DATA_DIR"] = TMP
# Las pruebas no leen config/private.json: usan datos privados ficticios por variables de entorno.
os.environ["NUBIK_PRIVATE_CONFIG"] = str(Path(TMP) / "no-existe.json")
FAKE = {"BANK_NAME": "Banco Ficticio", "BANK_ACCOUNT_NUMBER": "000-777777-00", "BANK_HOLDER": "Titular Ficticio",
        "COSTO_PELOTA": "10101", "COSTO_GUANTE": "20202", "FLETE_ESTIMADO": "3030"}
os.environ.update(FAKE)
import server  # noqa: E402

CFG = server.load_config()
CUSTOMER = {"nombre": "Cliente Prueba", "celular": "3001234567", "email": "", "departamento": "Antioquia",
            "ciudad": "Medellín", "direccion": "Calle 1 # 2-3", "detalle": "", "notas": "", "aceptaTratamiento": True}


class Reglas(unittest.TestCase):
    def test_precios(self):
        r = server.price_cart(CFG, [{"id": "pelota-interactiva", "qty": 1}])
        self.assertEqual(r["total"], 59900)
        r = server.price_cart(CFG, [{"id": "combo-nubik", "qty": 1}])
        self.assertEqual(r["total"], 89900)

    def test_subtotales_y_total(self):
        r = server.price_cart(CFG, [{"id": "pelota-interactiva", "qty": 2}, {"id": "combo-nubik", "qty": 3}])
        self.assertEqual(r["subtotal"], 2 * 59900 + 3 * 89900)
        self.assertEqual(r["shipping"], 0)
        self.assertEqual(r["total"], r["subtotal"])  # el flete interno no se suma

    def test_lineas_duplicadas_se_agrupan(self):
        r = server.price_cart(CFG, [{"id": "combo-nubik", "qty": 1}, {"id": "combo-nubik", "qty": 2}])
        self.assertEqual(len(r["lines"]), 1)
        self.assertEqual(r["lines"][0]["qty"], 3)

    def test_guante_no_se_vende_solo(self):
        with self.assertRaises(server.OrderError):
            server.price_cart(CFG, [{"id": "guante-quitapelos", "qty": 1}])
        with self.assertRaises(server.OrderError):
            server.price_cart(CFG, [{"id": "combo-nubik", "qty": 1}, {"id": "guante-quitapelos", "qty": 1}])

    def test_precio_del_navegador_se_ignora(self):
        r = server.price_cart(CFG, [{"id": "combo-nubik", "qty": 1, "price": 1, "unitPrice": 1}])
        self.assertEqual(r["total"], 89900)

    def test_cantidades_invalidas(self):
        for q in (0, -1, 1.5, "2", True, 11):
            with self.assertRaises(server.OrderError, msg=q):
                server.price_cart(CFG, [{"id": "pelota-interactiva", "qty": q}])
        with self.assertRaises(server.OrderError):
            server.price_cart(CFG, [])
        with self.assertRaises(server.OrderError):
            server.price_cart(CFG, [{"id": "otro", "qty": 1}])

    def test_inventario_cuando_se_configura(self):
        cfg = json.loads(json.dumps(CFG))
        cfg["internal"]["inventory"] = {"pelota-interactiva": 3, "guante-quitapelos": 1}
        server.price_cart(cfg, [{"id": "combo-nubik", "qty": 1}, {"id": "pelota-interactiva", "qty": 2}])
        with self.assertRaises(server.OrderError):  # el combo consume guante
            server.price_cart(cfg, [{"id": "combo-nubik", "qty": 2}])
        with self.assertRaises(server.OrderError):  # 1 combo + 3 pelotas = 4 pelotas > 3
            server.price_cart(cfg, [{"id": "combo-nubik", "qty": 1}, {"id": "pelota-interactiva", "qty": 3}])

    def test_margenes_internos(self):
        m = server.internal_margin(CFG, server.price_cart(CFG, [{"id": "pelota-interactiva", "qty": 1}]))
        self.assertEqual(m["marginBeforeOtherExpenses"], 59900 - 10101 - 3030)
        m = server.internal_margin(CFG, server.price_cart(CFG, [{"id": "combo-nubik", "qty": 1}]))
        self.assertEqual((m["productCost"], m["marginBeforeOtherExpenses"]), (10101 + 20202, 89900 - 10101 - 20202 - 3030))
        sin_costos = json.loads(json.dumps(CFG))
        sin_costos["internal"]["supplierCosts"]["guante-quitapelos"] = None
        self.assertEqual(server.internal_margin(sin_costos, server.price_cart(CFG, [{"id": "combo-nubik", "qty": 1}])), {})

    def test_transferencia_fuera_de_paginas_publicas(self):
        boot = json.dumps(server.public_bootstrap(CFG))
        self.assertNotIn(FAKE["BANK_ACCOUNT_NUMBER"], boot)
        self.assertNotIn(FAKE["BANK_HOLDER"], boot)
        self.assertNotIn("bankTransfer", boot)

    def test_transferencia_solo_con_datos_completos(self):
        import copy
        cfg = copy.deepcopy(CFG)
        cfg["bankTransfer"].update(bank=None, holder=None)
        self.assertIsNone(server.transfer_info(cfg))
        self.assertFalse(server.public_bootstrap(cfg)["config"]["payments"]["transferReady"])
        r = server.create_order(cfg, {"items": [{"id": "combo-nubik", "qty": 1}], "customer": CUSTOMER, "paymentMethod": "transferencia"})
        self.assertIsNone(r["transfer"])
        cfg["bankTransfer"].update(bank="Banco Prueba", holder="Titular Prueba")
        self.assertTrue(server.public_bootstrap(cfg)["config"]["payments"]["transferReady"])
        r = server.create_order(cfg, {"items": [{"id": "combo-nubik", "qty": 1}], "customer": CUSTOMER, "paymentMethod": "transferencia"})
        self.assertEqual(r["transfer"]["amount"], 89900)
        self.assertEqual(r["transfer"]["reference"], r["id"])
        self.assertEqual(r["paymentStatus"], "pendiente")  # nunca se marca pagado solo
        r = server.create_order(cfg, {"items": [{"id": "combo-nubik", "qty": 1}], "customer": CUSTOMER, "paymentMethod": "tarjeta"})
        self.assertIsNone(r["transfer"])

    def test_datos_publicos_sin_costos(self):
        boot = json.dumps(server.public_bootstrap(CFG))
        for secreto in (FAKE["COSTO_PELOTA"], FAKE["COSTO_GUANTE"], FAKE["FLETE_ESTIMADO"], "supplierCosts", "inventory", "estimatedFreight"):
            self.assertNotIn(secreto, boot)
        b = server.public_bootstrap(CFG)
        self.assertIsNone(b["products"]["guante-quitapelos"]["price"])
        self.assertFalse(b["products"]["guante-quitapelos"]["sellableAlone"])
        self.assertFalse(b["config"]["payments"]["onlineEnabled"])
        self.assertFalse(b["config"]["payments"]["cashOnDelivery"])
        self.assertIsNone(b["config"]["contact"]["customerServiceEmail"])
        self.assertEqual(b["config"]["contact"]["whatsappUrl"], "https://wa.me/573184526653")


class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def setUp(self):
        import antispam
        antispam.reset()

    def req(self, path, body=None, method=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method or ("POST" if data else "GET"),
                                   headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, resp.read().decode(), resp.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(), e.headers

    def test_rutas_publicas(self):
        for p in server.ROUTES:
            s, body, _ = self.req(p)
            self.assertEqual(s, 200, p)
            self.assertIn("<title>", body)
            self.assertNotIn("{{", body, p)
            for secreto in (FAKE["COSTO_PELOTA"], FAKE["COSTO_GUANTE"], FAKE["FLETE_ESTIMADO"], FAKE["BANK_ACCOUNT_NUMBER"]):
                self.assertNotIn(secreto, body, (p, secreto))

    def test_404(self):
        self.assertEqual(self.req("/no-existe")[0], 404)

    def test_guante_url_directa_redirige(self):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        opener = urllib.request.build_opener(NoRedirect)
        try:
            opener.open(self.base + "/productos/guante-quitapelos")
            self.fail("esperaba redirección")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 301)
            self.assertEqual(e.headers["Location"], "/combo-nubik")

    def test_seo_producto(self):
        _, body, _ = self.req("/productos/pelota-interactiva")
        self.assertIn('"price": "59900"', body)
        self.assertIn('og:title', body)
        stock = CFG["internal"]["inventory"].get("pelota-interactiva")
        if stock is None:
            self.assertNotIn("InStock", body)  # stock no informado: no se declara
        else:
            self.assertIn("InStock" if stock > 0 else "OutOfStock", body)
        self.assertNotIn("aggregateRating", body)

    def test_quote_y_guante(self):
        s, body, _ = self.req("/api/cart/quote", {"items": [{"id": "combo-nubik", "qty": 2}]})
        self.assertEqual(s, 200)
        self.assertEqual(json.loads(body)["total"], 179800)
        s, body, _ = self.req("/api/cart/quote", {"items": [{"id": "guante-quitapelos", "qty": 1}]})
        self.assertEqual(s, 400)
        self.assertIn("Combo", json.loads(body)["error"])

    def test_pedido_sin_pago_simulado(self):
        s, body, _ = self.req("/api/orders", {"items": [{"id": "pelota-interactiva", "qty": 1, "price": 5}],
                                              "customer": CUSTOMER, "paymentMethod": "transferencia"})
        self.assertEqual(s, 201, body)
        r = json.loads(body)
        self.assertTrue(r["id"].startswith("NBK-"))
        self.assertEqual(r["paymentStatus"], "pendiente")
        self.assertFalse(r["payment"]["enabled"])
        self.assertEqual(r["priced"]["total"], 59900)
        self.assertNotIn("internal", r)
        saved = (Path(TMP) / "orders.jsonl").read_text(encoding="utf-8")
        self.assertIn(r["id"], saved)

    def test_pedido_validaciones(self):
        bad = dict(CUSTOMER, celular="12345")
        self.assertEqual(self.req("/api/orders", {"items": [{"id": "combo-nubik", "qty": 1}], "customer": bad, "paymentMethod": "tarjeta"})[0], 400)
        sin_aut = dict(CUSTOMER, aceptaTratamiento=False)
        self.assertEqual(self.req("/api/orders", {"items": [{"id": "combo-nubik", "qty": 1}], "customer": sin_aut, "paymentMethod": "tarjeta"})[0], 400)
        s, body, _ = self.req("/api/orders", {"items": [{"id": "combo-nubik", "qty": 1}], "customer": CUSTOMER, "paymentMethod": "contraentrega"})
        self.assertEqual(s, 400)

    def test_webhook_no_configurado(self):
        self.assertEqual(self.req("/api/payments/webhook", {"x": 1})[0], 501)

    def test_static_traversal(self):
        self.assertEqual(self.req("/assets/../config/business.json")[0], 404)
        self.assertEqual(self.req("/assets/%2e%2e/config/business.json")[0], 404)

    def test_video_con_rangos(self):
        r = urllib.request.Request(self.base + "/assets/video/portada-pelota.mp4", headers={"Range": "bytes=0-99"})
        with urllib.request.urlopen(r) as resp:
            self.assertEqual(resp.status, 206)
            self.assertEqual(len(resp.read()), 100)
            self.assertTrue(resp.headers["Content-Range"].startswith("bytes 0-99/"))
            self.assertEqual(resp.headers["Content-Type"], "video/mp4")

    # ------------------------------------------------ panel de pedidos
    def admin_req(self, path, pw=None, form=None, headers=None):
        import base64, urllib.parse
        h = dict(headers or {})
        if pw:
            h["Authorization"] = "Basic " + base64.b64encode(f"nubik:{pw}".encode()).decode()
        data = urllib.parse.urlencode(form).encode() if form else None
        if data:
            h["Content-Type"] = "application/x-www-form-urlencoded"
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        opener = urllib.request.build_opener(NoRedirect)
        try:
            with opener.open(urllib.request.Request(self.base + path, data=data, headers=h)) as r:
                return r.status, r.read().decode(), r.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(), e.headers

    def test_panel_desactivado_sin_contrasena(self):
        os.environ.pop("NUBIK_ADMIN_PASSWORD", None)
        self.assertEqual(self.admin_req("/admin")[0], 503)

    def test_panel_con_contrasena_y_estados(self):
        import admin
        os.environ["NUBIK_ADMIN_PASSWORD"] = "clave-de-prueba-123"
        admin._fails.clear()
        try:
            cust = dict(CUSTOMER, nombre='<script>alert(1)</script> Ana')
            s, body, _ = self.req("/api/orders", {"items": [{"id": "combo-nubik", "qty": 1}], "customer": cust, "paymentMethod": "transferencia"})
            oid = json.loads(body)["id"]
            self.assertEqual(self.admin_req("/admin")[0], 401)
            self.assertEqual(self.admin_req("/admin", pw="incorrecta-000")[0], 401)
            s, html, h = self.admin_req("/admin", pw="clave-de-prueba-123")
            self.assertEqual(s, 200)
            self.assertIn(oid, html)
            self.assertNotIn("<script>alert(1)</script>", html)  # datos del cliente escapados
            self.assertIn("noindex", h["X-Robots-Tag"])
            self.assertEqual(h["Cache-Control"], "no-store")
            # sin origen propio (posible CSRF) se rechaza
            s, _, _ = self.admin_req("/admin/estado", pw="clave-de-prueba-123", form={"id": oid, "status": "pago_recibido"})
            self.assertEqual(s, 403)
            host = self.base.split("//")[1]
            s, _, _ = self.admin_req("/admin/estado", pw="clave-de-prueba-123", form={"id": oid, "status": "pago_recibido"},
                                     headers={"Origin": "http://otro-sitio.com"})
            self.assertEqual(s, 403)
            s, _, h = self.admin_req("/admin/estado", pw="clave-de-prueba-123", form={"id": oid, "status": "pago_recibido"},
                                     headers={"Origin": "http://" + host})
            self.assertEqual(s, 303)
            self.assertEqual(admin.load_statuses(Path(TMP))[oid]["status"], "pago_recibido")
            s, _, _ = self.admin_req("/admin/estado", pw="clave-de-prueba-123", form={"id": oid, "status": "inventado"},
                                     headers={"Origin": "http://" + host})
            self.assertEqual(s, 400)
            # bloqueo tras demasiados intentos fallidos
            for _ in range(admin.MAX_FAILS):
                self.admin_req("/admin", pw="mala-clave-000")
            self.assertEqual(self.admin_req("/admin", pw="clave-de-prueba-123")[0], 429)
        finally:
            os.environ.pop("NUBIK_ADMIN_PASSWORD", None)
            admin._fails.clear()

    def test_aviso_por_correo(self):
        import admin
        sent = []
        class FakeSMTP:
            def __init__(self, *a, **k): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def login(self, *a): pass
            def send_message(self, m): sent.append(m)
        env = {"SMTP_HOST": "smtp.prueba", "SMTP_USER": "u@prueba.co", "SMTP_PASSWORD": "x", "NOTIFY_EMAIL": "n@prueba.co"}
        old = admin.smtplib.SMTP_SSL
        admin.smtplib.SMTP_SSL = FakeSMTP
        os.environ.update(env)
        try:
            r = server.create_order(CFG, {"items": [{"id": "pelota-interactiva", "qty": 2}], "customer": CUSTOMER, "paymentMethod": "transferencia"})
            order = admin.load_orders(Path(TMP))[0]
            self.assertTrue(admin.notify_new_order(order, "https://nubik.test", background=False))
            msg = sent[-1]
            self.assertIn(r["id"], msg["Subject"])
            self.assertIn("$119.800", msg.get_content())
            self.assertNotIn("Margen", msg.get_content())
        finally:
            admin.smtplib.SMTP_SSL = old
            for k in env: os.environ.pop(k, None)
        self.assertFalse(admin.notify_new_order(order, "https://nubik.test", background=False))  # sin configurar: no envía

    # ------------------------------------------------ anti-spam
    def pedido(self, **cust):
        return self.req("/api/orders", {"items": [{"id": "combo-nubik", "qty": 1}],
                                        "customer": dict(CUSTOMER, **cust), "paymentMethod": "transferencia"})

    def test_campo_trampa_rechaza_bots(self):
        s, body, _ = self.pedido(empresa="Bot S.A.S")
        self.assertEqual(s, 400)
        s, _, _ = self.pedido(empresa="")
        self.assertEqual(s, 201)

    def test_doble_envio_no_duplica(self):
        s1, b1, _ = self.pedido()
        s2, b2, _ = self.pedido()
        self.assertEqual((s1, s2), (201, 200))
        self.assertEqual(json.loads(b1)["id"], json.loads(b2)["id"])
        ids = [json.loads(l)["id"] for l in (Path(TMP) / "orders.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(ids.count(json.loads(b1)["id"]), 1)

    def test_limite_por_celular(self):
        import antispam
        ok = 0
        for n in range(1, 6):  # cantidades distintas para que no cuente como duplicado
            s, _, _ = self.req("/api/orders", {"items": [{"id": "combo-nubik", "qty": n}], "customer": CUSTOMER, "paymentMethod": "transferencia"})
            ok += s == 201
            last = s
        self.assertEqual(ok, antispam.LIMITS["order-tel"][0])
        self.assertEqual(last, 429)
        s, _, _ = self.pedido(celular="3109876543")  # otro cliente sí puede pedir
        self.assertEqual(s, 201)

    def test_limite_por_conexion(self):
        import antispam
        limit = antispam.LIMITS["order-ip"][0]
        codes = [self.pedido(celular=f"31{n:08d}")[0] for n in range(limit + 1)]
        self.assertEqual(codes[-1], 429)
        self.assertTrue(all(c == 201 for c in codes[:limit]))

    def test_headers_seguridad(self):
        _, _, h = self.req("/")
        self.assertEqual(h["X-Content-Type-Options"], "nosniff")
        self.assertIn("frame-ancestors 'none'", h["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
