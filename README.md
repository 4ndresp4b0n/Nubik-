# Tienda online NUBIK

Tienda de NUBIK (pelota interactiva para gatos + Combo NUBIK con guante quitapelos).
Python 3.10+ con librería estándar únicamente — **sin dependencias que instalar**.

## Ejecutar en local

```bash
python server.py          # http://127.0.0.1:8000
python server.py 8765     # otro puerto
```

## Pruebas

```bash
python -m unittest discover -s tests -v   # 19 pruebas: precios, combo, guante, API, seguridad
python tools/margenes.py                  # reporte interno de márgenes (no se publica)
```

## Estructura

| Ruta | Qué es |
|---|---|
| `config/business.json` | **Configuración central**: precios, combo, contacto, envíos, horarios, garantía, medios de pago, costos internos, inventario. Solo la sección `public` y los productos (sin costos) llegan al navegador. |
| `server.py` | Servidor HTTP: páginas con SEO por ruta, API de cotización y solicitudes de pedido, validación de precios en servidor, cabeceras de seguridad, sitemap y robots. |
| `payments.py` | Punto único de integración de la pasarela (hoy: ninguna; no simula pagos). |
| `public/` | Frontend (HTML/CSS/JS sin framework). `assets/js/app.js` router + carrito + vistas; `content.js` FAQ y textos legales. |
| `data/orders.jsonl` | Solicitudes de pedido registradas (se crea sola; contiene datos personales, no versionar). |

## Reglas comerciales implementadas

- Pelota $59.900 COP · Combo $89.900 COP · envío al cliente $0.
- El guante no se vende solo: el servidor rechaza `guante-quitapelos` en carrito/pedido, el carrito local lo descarta, y `/productos/guante-quitapelos` redirige 301 a `/combo-nubik`.
- El flete interno y los costos de proveedor nunca se envían al navegador ni se suman al total.
- El checkout registra una **solicitud de pedido** con estado `pendiente` de pago. No hay pago contra entrega, no se piden datos de tarjeta y no se muestra ningún "pago exitoso".

## Pedidos: panel privado y aviso por correo

- **Panel:** `/admin` (por ejemplo `https://tudominio.co/admin`). Muestra los pedidos, los datos de entrega,
  un botón para escribir al cliente por WhatsApp y el estado (pendiente de pago, pago recibido, despachado,
  entregado, cancelado). La pestaña muestra entre paréntesis los pedidos pendientes y la página se actualiza cada minuto.
  - Se activa con la variable de entorno `NUBIK_ADMIN_PASSWORD` (mínimo 10 caracteres). Sin ella el panel queda apagado.
  - El navegador pide usuario y contraseña: el usuario puede ser cualquiera (por ejemplo `nubik`).
  - 10 intentos fallidos bloquean el acceso desde esa conexión por 15 minutos.
- **Aviso por correo (opcional):** con estas variables llega un correo por cada pedido nuevo.
  `SMTP_HOST`, `SMTP_PORT` (465 por defecto), `SMTP_USER`, `SMTP_PASSWORD`, `NOTIFY_EMAIL` (a dónde llega) y `SMTP_FROM` (opcional).
  Con Gmail: `SMTP_HOST=smtp.gmail.com` y una *contraseña de aplicación* de Google (no la contraseña normal).
- **Anti-spam:** máximo 20 intentos de pedido por hora por conexión y 3 pedidos nuevos por hora por celular;
  campo trampa invisible para bots; un doble clic devuelve el mismo pedido en vez de crear otro.
  En el hosting (detrás de su proxy) define `TRUST_PROXY=1` para que el límite use la IP real del cliente.
- **Datos privados** (cuenta bancaria, costos, flete, contacto del proveedor): **no están en el repositorio**.
  En tu PC van en `config/private.json` (excluido de Git). En el hosting, en variables de entorno
  (`BANK_*`, `COSTO_PELOTA`, `COSTO_GUANTE`, `FLETE_ESTIMADO`; ver DESPLIEGUE.md).
- **Transferencia:** se activa cuando banco, número de cuenta y titular están definidos. Solo se muestran al cliente después de registrar su pedido.

## Despliegue

Guía paso a paso con Railway y dominio propio: **[DESPLIEGUE.md](DESPLIEGUE.md)** (incluye `Dockerfile` y `railway.json`).

Cualquier hosting que ejecute Python (Render, Railway, Fly.io, un VPS):

```bash
HOST=0.0.0.0 PORT=8000 SITE_URL=https://tu-dominio.co python server.py
```

- `SITE_URL` define canonical, Open Graph y sitemap.
- Pon el servidor detrás de HTTPS (lo da el hosting o un proxy como Caddy/Nginx).
- `data/` debe estar en un disco persistente (o `NUBIK_DATA_DIR`). Para volumen real, migrar los pedidos a una base de datos.
- Un hosting estático (Netlify/GitHub Pages) **no sirve**: se necesita el servidor para validar precios y registrar pedidos.

## Conectar una pasarela de pagos (Colombia)

Opciones habituales: Wompi, ePayco, Mercado Pago, PayU. Pasos en `payments.py`:
1. Llaves como variables de entorno del servidor (nunca en `public/`).
2. `start_payment()` crea la transacción con el total recalculado en el servidor y devuelve la URL/widget oficial.
3. `/api/payments/webhook`: verificar firma del evento y consultar el estado en la API de la pasarela antes de marcar el pedido como pagado.
4. Página de resultado que consulte el estado real en el servidor.
5. Cambiar `payments.enabled()` y `public.payments.onlineEnabled` solo tras probar en modo sandbox.

## Pendientes antes de vender

- **Logo**: original en `marca-original/nubik-logo.png`; versión web en `public/assets/img/marca/nubik-logo.png` e iconos `nubik-icon-*.png`.
- Correo oficial de atención (`contact.customerServiceEmail`), razón social, NIT, domicilio.
- Pasarela de pagos y datos bancarios.
- Transportadora (`shipping.carrier`) y confirmación de horarios de despacho.
- Garantía: confirmar por escrito con el proveedor los puntos de `warranty.pendingConfirmation`.
- Inventario (`internal.inventory`); con `null` la web muestra "disponibilidad por confirmar".
- Revisión legal de `/privacidad`, `/terminos` y `/cambios-y-devoluciones` (marcadas como borrador).
- Un panel de administración no está incluido; si se añade, debe llevar autenticación real.
