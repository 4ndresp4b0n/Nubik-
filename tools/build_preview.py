"""
Genera una VISTA PREVIA ESTÁTICA de la tienda en dist-preview/ para compartirla por enlace.

Diferencias con la tienda real (python server.py):
- Sin servidor: el carrito calcula con las mismas reglas en el navegador y el checkout
  envía el pedido por WhatsApp en lugar de registrarlo en data/orders.jsonl.
- Navegación con #nombre (p. ej. #combo-nubik) y rutas relativas a los archivos.
Solo se incluye la parte pública de config/business.json (sin costos ni contacto del proveedor).

Uso:  python tools/build_preview.py
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

OUT = ROOT / "dist-preview"
PUB = ROOT / "public"


def main():
    cfg = server.load_config()
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "assets").mkdir(parents=True)
    for sub in ("css", "js", "video", "img/productos", "img/marca"):
        src = PUB / "assets" / sub
        if src.exists():
            shutil.copytree(src, OUT / "assets" / sub, ignore=shutil.ignore_patterns("*.txt"))
    shutil.copy(PUB / "favicon.svg", OUT / "favicon.svg")

    boot = server.public_bootstrap(cfg)
    boot["static"] = True
    if boot["config"]["brand"]["logoAvailable"] is False:
        shutil.rmtree(OUT / "assets" / "img" / "marca", ignore_errors=True)
    boot_json = server.safe_json_for_html(boot)
    full = server.load_config()
    private_values = [str(v) for v in (full.get("bankTransfer") or {}).values() if v and v != "Ahorros"]
    private_values += [str(v) for v in (full["internal"].get("supplierCosts") or {}).values() if v]
    private_values += [str(full["internal"].get("estimatedFreightPerOrder") or "")]
    private_values += [str((full["internal"].get("supplierContact") or {}).get("email") or "")]
    for secret in ["supplierCosts", "estimatedFreight", "bankTransfer"] + [v for v in private_values if v]:
        assert secret not in boot_json, f"dato interno en la vista previa: {secret}"

    desc = server.esc(server.ROUTES["/"][1])
    html = f"""<title>NUBIK Tienda</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#1F3A5F">
<link rel="icon" href="assets/img/marca/nubik-icon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/img/marca/nubik-icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="assets/css/styles.css">
<script type="application/ld+json" id="jsonld">[]</script>
<script type="application/json" id="boot">{boot_json}</script>
<script type="module" src="assets/js/app.js"></script>
<header class="nav" id="nav"></header>
<main id="main" tabindex="-1"></main>
<footer class="footer" id="footer"></footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    files = sorted(p.relative_to(OUT).as_posix() for p in OUT.rglob("*") if p.is_file() and p.name != "index.html")
    (OUT / "files.json").write_text(json.dumps(files, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"dist-preview/: {len(files) + 1} archivos, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
