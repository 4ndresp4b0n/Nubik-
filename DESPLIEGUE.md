# Publicar la tienda NUBIK en internet (Railway + dominio propio)

La tienda ya trae todo lo necesario para publicarse: `Dockerfile`, `railway.json` y la
configuración de producción. Estos pasos se hacen **con tus cuentas**: nadie más debe crearlas por ti.

Costo aproximado (verifícalo en la página de precios de Railway antes de contratar):
- Railway, plan Hobby: 5 USD al mes, que incluyen 5 USD de uso. Una tienda pequeña normalmente cabe ahí.
- El volumen donde se guardan los pedidos se cobra por GB al mes; los pedidos ocupan muy poco.
- El dominio (`.com.co` o `.co`) se paga aparte, normalmente una vez al año, en el registrador que elijas.

---

## 1. Subir el proyecto a GitHub (privado)

1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio **privado** llamado `nubik-tienda` (sin README ni .gitignore: ya existen).
3. El proyecto ya es un repositorio Git con todo guardado. Solo falta conectarlo y subirlo.
   En la carpeta del proyecto (`C:\Users\usuario\Documents\nubik-tienda`) ejecuta, cambiando `TU_USUARIO`:

```bash
git remote add origin https://github.com/TU_USUARIO/nubik-tienda.git
git push -u origin main
```

   La primera vez, Windows abre una ventana para iniciar sesión en GitHub.
   El repositorio puede ser público: la cuenta bancaria, los costos y el contacto del proveedor **no se suben**
   (están en `config/private.json`, que Git ignora). En Railway se escriben como variables (paso 3).

No se suben los pedidos (`data/`), la vista previa (`dist-preview/`) ni archivos `.env`.

## 2. Crear el servicio en Railway

1. Entra a https://railway.com e inicia sesión con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo →** elige `nubik-tienda`.
   Railway detecta el `Dockerfile` y construye la tienda.
3. **Volumen para los pedidos (obligatorio):** en el servicio, *Add Volume* con ruta de montaje `/data`.
   Sin volumen, los pedidos se borran cada vez que se actualiza la tienda.

## 3. Variables de entorno (servicio → Variables)

| Variable | Valor | Para qué |
|---|---|---|
| `SITE_URL` | `https://tudominio.com.co` (sin `/` al final) | Google, sitemap y vista previa en redes |
| `NUBIK_ADMIN_PASSWORD` | Una contraseña larga y única (mínimo 10 caracteres) | Entrar al panel `/admin` |
| `TRUST_PROXY` | `1` | Que el anti-spam vea la conexión real de cada cliente |
| `BANK_NAME` | Nombre del banco | Datos que ve el cliente al pagar por transferencia |
| `BANK_ACCOUNT_TYPE` | `Ahorros` o `Corriente` | |
| `BANK_ACCOUNT_NUMBER` | Número de la cuenta | |
| `BANK_HOLDER` | Titular, tal como aparece en el banco | |
| `BANK_HOLDER_ID` | Cédula o NIT del titular (opcional) | |
| `COSTO_PELOTA` | Costo de la pelota, solo números | Margen en el panel `/admin` (opcional) |
| `COSTO_GUANTE` | Costo del guante, solo números | |
| `FLETE_ESTIMADO` | Flete estimado por pedido, solo números | |
| `SMTP_HOST` | `smtp.gmail.com` (opcional) | Aviso por correo de cada pedido |
| `SMTP_USER` | Tu correo de Gmail (opcional) | |
| `SMTP_PASSWORD` | *Contraseña de aplicación* de Google (opcional) | No uses tu contraseña normal |
| `NOTIFY_EMAIL` | Correo donde quieres recibir los avisos (opcional) | |

`HOST`, `PORT` y `NUBIK_DATA_DIR` ya vienen configurados; no los cambies.

Las contraseñas se escriben **solo** en Railway: nunca en archivos del proyecto ni en GitHub.

## 4. Probar con la dirección temporal de Railway

1. Servicio → *Settings → Networking → Generate Domain*. Railway da una dirección `*.up.railway.app`.
2. Abre esa dirección y revisa:
   - `/api/health` responde `{"ok": true, ...}`.
   - La portada carga con los videos.
   - Haz un pedido de prueba con tus datos y míralo en `/admin`.
   - En los registros (*Deployments → View logs*) no aparece ninguna línea `AVISO:`.

## 5. Conectar el dominio

1. Compra el dominio en un registrador (`.com.co` o `.co`).
2. En Railway: *Settings → Networking → Custom Domain* → escribe tu dominio.
   Railway te muestra un registro DNS (normalmente un **CNAME**) para copiar.
3. En el panel DNS de tu registrador, crea ese registro exactamente como lo indica Railway.
   - Para `www.tudominio.com.co` basta un CNAME.
   - Para el dominio sin `www`, el registrador debe permitir CNAME en la raíz (a veces se llama ALIAS o
     *CNAME flattening*). Si no lo permite, usa el DNS gratuito de Cloudflare.
4. Espera a que Railway muestre el dominio como verificado; el certificado HTTPS (candado) se crea solo.
5. Actualiza `SITE_URL` con el dominio definitivo.

## 6. Verificación final

- [ ] `https://tudominio.com.co` abre con candado.
- [ ] `https://tudominio.com.co/sitemap.xml` muestra tu dominio, no `127.0.0.1`.
- [ ] Pedido de prueba desde un celular real: aparecen los datos de transferencia y el pedido llega a `/admin`
      (y al correo, si lo configuraste).
- [ ] Compartir el enlace por WhatsApp muestra título e imagen.
- [ ] Borra o cancela el pedido de prueba en `/admin`.

## Actualizar la tienda después

Cada cambio que se suba a GitHub (`git add . && git commit -m "..." && git push`) se publica solo en Railway.
Los pedidos del volumen `/data` se conservan.
