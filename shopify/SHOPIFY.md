# Pasar la tienda NUBIK a Shopify — paso a paso

En esta carpeta está todo lo necesario:

| Archivo | Para qué |
|---|---|
| `nubik-tema-shopify.zip` | El diseño de NUBIK como tema de Shopify (videos, gatito animado, secciones, colores). |
| `productos-shopify.csv` | Los 3 productos (pelota, combo, dúo) con precios, textos, especificaciones y fotos. |
| `politicas-borrador.md` | Textos de políticas para pegar en Shopify (borrador, requiere revisión legal). |

> Las cuentas, el plan y cualquier pago los haces tú. Nunca compartas contraseñas por chat.

---

## 1. Crear la tienda

1. Entra a https://www.shopify.com/co y crea tu cuenta (prueba gratis).
2. **Configuración → Información de la tienda / General**:
   - País: Colombia. Moneda de la tienda: **Peso colombiano (COP)**. Zona horaria: Bogotá.
   - **Formato de precios**: en "Moneda de la tienda → Cambiar formato", pon en los cuatro campos
     `${{amount_no_decimals_with_comma_separator}}` para que se vea **$59.900** (sin decimales).

## 2. Subir el tema

1. **Tienda online → Temas → Agregar tema → Subir archivo .zip** → elige `nubik-tema-shopify.zip`.
2. Cuando termine de subir, toca **Publicar** (o primero **Vista previa**).
3. Si Shopify muestra algún error al subir, cópiamelo tal cual y lo corrijo.

## 3. Importar los productos

1. **Productos → Importar** → sube `productos-shopify.csv` → **Importar productos**.
2. Revisa que queden 3 productos con sus fotos: *Pelota interactiva NUBIK*, *Combo NUBIK*, *Dúo de pelotas*.
   Sus identificadores (handles) deben ser `pelota-interactiva`, `combo-nubik` y `duo-pelotas`: el tema los usa.
3. En cada producto puedes agregar el **costo por artículo** (solo lo ves tú) para ver márgenes.
4. Inventario: el archivo los deja **sin control de stock** (siempre disponibles). Si quieres controlarlo,
   activa "Hacer seguimiento de la cantidad" en cada producto. Shopify no descuenta pelotas del combo ni del dúo
   automáticamente; para eso existe la app gratuita **Shopify Bundles**.
5. El guante **no** se crea como producto: así no se puede comprar solo.

## 4. Envío gratis

**Configuración → Envío y entrega → Envío general**: crea la zona **Colombia** con una tarifa
**"Envío gratis" de $0**. Borra cualquier otra tarifa para que el cliente nunca pague envío.

## 5. Pago por transferencia

**Configuración → Pagos → Métodos de pago manuales → Crear método de pago personalizado**:

- Nombre: `Transferencia bancaria`
- Detalles adicionales: `Transfiere el valor exacto y envíanos el comprobante por WhatsApp al +57 318 452 6653 con tu número de pedido.`
- Instrucciones de pago (aparecen al confirmar la compra): escribe **tú** los datos de la cuenta
  (banco, tipo de cuenta, número y titular) y el mismo mensaje del comprobante.

No actives "Pago contra entrega". Cuando tengas la cuenta de Wompi, se instala su app oficial desde
**Configuración → Pagos** para cobrar con tarjeta, PSE y Nequi (pruébala primero en modo de prueba).

Cada pedido llega a **Pedidos** en Shopify y Shopify te avisa por correo y en su app del celular.
Cuando veas la transferencia en tu banco, en el pedido toca **Marcar como pagado**.

## 6. Páginas

**Tienda online → Páginas → Agregar página**:

| Título | Plantilla (columna derecha) | Contenido |
|---|---|---|
| Envíos y garantías | `page.envios` | Puede quedar vacío |
| Preguntas frecuentes | `page.faq` | Puede quedar vacío |

Sus direcciones deben quedar como `/pages/envios-y-garantias` y `/pages/preguntas-frecuentes`
(Shopify las crea así a partir del título).

## 7. Políticas

**Configuración → Políticas**: pega los textos de `politicas-borrador.md` después de completarlos
y revisarlos. Aparecen solas en el pie de página.

## 8. Ajustes del tema

**Tienda online → Temas → Personalizar**: puedes cambiar textos de la portada y las preguntas frecuentes.
En **Configuración del tema → NUBIK** están el WhatsApp, los identificadores de los productos y los tiempos de entrega.

## 9. Dominio

**Configuración → Dominios**: compra uno en Shopify o conecta el tuyo.

## 10. Prueba final

- [ ] La portada muestra los videos y la sección "¿Cuál es para tu peludo?" con los 3 precios.
- [ ] Añadir al carrito funciona desde la portada y desde cada ficha.
- [ ] El checkout muestra **Envío gratis** y solo **Transferencia bancaria**.
- [ ] Haz un pedido de prueba, revisa el correo de confirmación y luego **cancélalo** en Pedidos.
- [ ] El gatito del pie de página abre los ojos y muestra sus mensajes.
