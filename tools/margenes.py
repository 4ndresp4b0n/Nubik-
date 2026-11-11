"""Reporte interno de márgenes (no se publica en la web).  Uso:  python tools/margenes.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

cfg = server.load_config()
m = server.money if hasattr(server, "money") else (lambda n: f"${n:,.0f}".replace(",", "."))
if not server.internal_margin(cfg, server.price_cart(cfg, [{"id": "pelota-interactiva", "qty": 1}])):
    sys.exit("Faltan los costos o el flete: complétalos en config/private.json o en las variables COSTO_PELOTA, COSTO_GUANTE y FLETE_ESTIMADO.")
print("MÁRGENES INTERNOS — antes de comisiones, publicidad, impuestos, devoluciones y otros gastos (NO es utilidad neta)")
print(f"Flete estimado por pedido: {m(cfg['internal']['estimatedFreightPerOrder'])} COP (estimación, no tarifa confirmada)\n")
for pid in ("pelota-interactiva", "combo-nubik"):
    priced = server.price_cart(cfg, [{"id": pid, "qty": 1}])
    r = server.internal_margin(cfg, priced)
    print(f"{cfg['products'][pid]['shortName']:<22} venta {m(priced['total']):>9}  costo prod. {m(r['productCost']):>8}  "
          f"bruto {m(priced['total'] - r['productCost']):>8}  después de flete {m(r['marginBeforeOtherExpenses']):>8}")
