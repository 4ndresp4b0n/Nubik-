"""Genera shopify/productos-shopify.csv para importar los productos de NUBIK en Shopify.

Uso:  python tools/shopify_csv.py
Las imágenes se toman del repositorio público en GitHub (deben estar subidas con git push).
No incluye costos ni datos privados.
"""
import csv
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = 'https://raw.githubusercontent.com/4ndresp4b0n/Nubik-/main/public/assets/img/productos/'
OUT = ROOT / 'shopify' / 'productos-shopify.csv'

SPECS_BALL = ('<dl class="specs"><div><dt>Tamaño</dt><dd>4 × 4 × 4 cm</dd></div><div><dt>Peso</dt><dd>50 g</dd></div>'
              '<div><dt>Material</dt><dd>Goma</dd></div><div><dt>Color</dt><dd>Azul</dd></div></dl>')
SPECS_GLOVE = ('<dl class="specs"><div><dt>Cerdas</dt><dd>Metálicas con puntas redondeadas</dd></div><div><dt>Ajuste</dt><dd>Ajustable a la mano</dd></div>'
               '<div><dt>Material</dt><dd>Tela</dd></div><div><dt>Medidas</dt><dd>15 × 3 × 5 cm</dd></div>'
               '<div><dt>Peso</dt><dd>100 g</dd></div><div><dt>Color</dt><dd>Gris</dd></div></dl>')
NOTE = '<p class="muted small">Especificaciones informadas por el proveedor.</p>'

PRODUCTS = [
    dict(handle='pelota-interactiva', title='Pelota interactiva NUBIK', sku='NBK-PELOTA', price='59900', grams='50',
         seo=('Pelota interactiva para gatos NUBIK | $59.900 COP, envío gratis',
              'Juguete para gatos que se mueve solo, con tres modos de funcionamiento. Recargable, cargador incluido en la caja. Envío gratis en Colombia.'),
         body=('<p class="lead">Haz que los momentos de juego de tu gato sean más dinámicos con la pelota interactiva NUBIK. '
               'Su movimiento automático y sus tres modos de funcionamiento ofrecen distintas opciones de entretenimiento.</p>'
               '<div class="notice notice--info"><span><strong>Recuerda cargarla antes de usarla:</strong> el cargador viene incluido en la caja.</span></div>'
               '<h2>Características</h2><ul class="spec"><li>Se mueve sola.</li><li>Tres modos de funcionamiento.</li>'
               '<li>Necesita estar cargada para funcionar.</li><li>Cargador incluido en la caja.</li></ul>'
               '<h2>Especificaciones</h2>' + SPECS_BALL + NOTE),
         imgs=[('pelota-frontal', 'Pelota interactiva NUBIK azul'),
               ('vida-gato-pelota', 'Gato atrapando la pelota interactiva NUBIK en la sala'),
               ('gatito-pelota', 'Gatito naranja persiguiendo la pelota interactiva NUBIK'),
               ('collage-gato-pelota', 'Gato jugando con la pelota interactiva NUBIK'),
               ('pelota-gato-juego', 'Gato jugando con la pelota interactiva NUBIK'),
               ('pelota-gato', 'Gato abrazando la pelota interactiva NUBIK'),
               ('real-pelota-palma', 'Fotografía real de la pelota en la palma de la mano'),
               ('real-pelota-encendida', 'Fotografía real de la pelota interactiva sostenida con los dedos'),
               ('real-pelota-lateral', 'Fotografía real de la pelota vista de lado'),
               ('real-pelota-alfombra', 'Fotografía real de la pelota sobre una alfombra')]),
    dict(handle='combo-nubik', title='Combo NUBIK: pelota interactiva + guante quitapelos', sku='NBK-COMBO', price='89900', grams='150',
         seo=('Combo NUBIK: pelota interactiva + guante quitapelos | $89.900 COP',
              'Pelota interactiva para gatos y guante quitapelos para perros y gatos en un solo combo. Envío gratis a toda Colombia.'),
         body=('<p class="lead">Dos formas de cuidar sus momentos: la pelota interactiva para jugar y el guante quitapelos '
               'para ayudar a retirar el pelo suelto de perros y gatos.</p>'
               '<h2>Qué incluye</h2><ul class="spec"><li><strong>1 pelota interactiva NUBIK</strong>: se mueve sola, tres modos de '
               'funcionamiento, recargable, cargador incluido.</li><li><strong>1 guante quitapelos NUBIK</strong>: para perros y gatos, '
               'ayuda a retirar el pelo suelto durante el cuidado del pelaje.</li></ul>'
               '<div class="notice"><span>El guante quitapelos no se vende por separado: está disponible únicamente dentro de este combo.</span></div>'
               '<h2>Especificaciones</h2><h3 class="specs__title">Pelota interactiva</h3>' + SPECS_BALL +
               '<h3 class="specs__title">Guante quitapelos</h3>' + SPECS_GLOVE + NOTE),
         imgs=[('combo-nubik', 'Combo NUBIK: pelota interactiva y guante quitapelos'),
               ('vida-gato-guante', 'Gato relajado mientras lo cepillan con el guante quitapelos NUBIK'),
               ('vida-gato-pelota', 'Gato atrapando la pelota interactiva NUBIK'),
               ('vida-perro-guante', 'Perro cepillado con el guante quitapelos NUBIK'),
               ('collage-gato-guante-pelo', 'Guante quitapelos NUBIK con pelo suelto retirado de un gato'),
               ('collage-perro-guante', 'Guante quitapelos NUBIK sobre el pelaje de un perro'),
               ('guante-mano', 'Guante quitapelos NUBIK'),
               ('guante-perro', 'Guante quitapelos NUBIK usado con un perro'),
               ('guante-angulo', 'Guante quitapelos NUBIK visto en ángulo'),
               ('real-guante-mano', 'Fotografía real del guante quitapelos puesto'),
               ('real-guante-lateral', 'Fotografía real del guante quitapelos de lado')]),
    dict(handle='duo-pelotas', title='Dúo de pelotas interactivas NUBIK', sku='NBK-DUO', price='80000', grams='100',
         seo=('Dúo de pelotas interactivas para gatos NUBIK | $80.000 COP',
              'Dos pelotas interactivas para gatos que se mueven solas, cada una con su cargador. Ideal para hogares con dos gatos. Envío gratis en Colombia.'),
         body=('<p class="lead">Dos pelotas interactivas, cada una con su cargador: para que jueguen dos gatos a la vez, '
               'o para tener una lista mientras la otra se carga.</p>'
               '<div class="notice notice--info"><span><strong>Recuerda cargarlas antes de usarlas:</strong> cada pelota trae su cargador.</span></div>'
               '<h2>Qué incluye</h2><ul class="spec"><li><strong>2 pelotas interactivas NUBIK</strong>: se mueven solas y tienen tres '
               'modos de funcionamiento.</li><li><strong>2 cargadores</strong>, uno por pelota.</li></ul>'
               '<h2>Especificaciones de cada pelota</h2>' + SPECS_BALL + NOTE),
         imgs=[('duo-pelotas', 'Dos pelotas interactivas NUBIK azules'),
               ('gatito-pelota', 'Gatito naranja persiguiendo la pelota interactiva NUBIK'),
               ('vida-gato-pelota', 'Gato atrapando la pelota interactiva NUBIK en la sala'),
               ('pelota-frontal', 'Pelota interactiva NUBIK azul'),
               ('real-pelota-palma', 'Fotografía real de la pelota en la palma de la mano'),
               ('real-pelota-alfombra', 'Fotografía real de la pelota sobre una alfombra')]),
]

COLS = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value',
        'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Policy', 'Variant Fulfillment Service',
        'Variant Price', 'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'Image Position', 'Image Alt Text',
        'SEO Title', 'SEO Description', 'Status']


def main(check=True):
    OUT.parent.mkdir(exist_ok=True)
    urls = set()
    with open(OUT, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=COLS)
        w.writeheader()
        for p in PRODUCTS:
            for i, (img, alt) in enumerate(p['imgs']):
                url = RAW + img + '-960.webp'
                urls.add(url)
                row = {'Handle': p['handle'], 'Image Src': url, 'Image Position': i + 1, 'Image Alt Text': alt}
                if i == 0:
                    row.update({'Title': p['title'], 'Body (HTML)': p['body'], 'Vendor': 'NUBIK', 'Type': 'Mascotas',
                                'Tags': 'gatos, mascotas', 'Published': 'TRUE', 'Option1 Name': 'Title',
                                'Option1 Value': 'Default Title', 'Variant SKU': p['sku'], 'Variant Grams': p['grams'],
                                'Variant Inventory Tracker': '', 'Variant Inventory Policy': 'deny',
                                'Variant Fulfillment Service': 'manual', 'Variant Price': p['price'],
                                'Variant Requires Shipping': 'TRUE', 'Variant Taxable': 'FALSE',
                                'SEO Title': p['seo'][0], 'SEO Description': p['seo'][1], 'Status': 'active'})
                w.writerow(row)
    print(f'{OUT.relative_to(ROOT)}: {len(PRODUCTS)} productos, {len(urls)} imágenes')
    if check:
        missing = []
        for u in sorted(urls):
            try:
                urllib.request.urlopen(urllib.request.Request(u, method='HEAD'), timeout=20)
            except Exception as exc:  # noqa: BLE001
                missing.append((u, exc))
        for u, exc in missing:
            print('FALTA', u, exc)
        print('imágenes verificadas' if not missing else f'{len(missing)} imágenes no disponibles')


if __name__ == '__main__':
    main()
