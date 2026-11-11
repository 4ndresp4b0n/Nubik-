// Contenido editorial. Solo información confirmada: no añadir datos técnicos no verificados.
import { money } from './util.js';

export function faqs(cfg, products) {
  const ball = products['pelota-interactiva'].price;
  const combo = products['combo-nubik'].price;
  const est = cfg.shipping.estimates.map(e => `${e.zone.toLowerCase()}: ${e.businessDays}`).join('; ');
  return [
    { q: '¿Cómo funciona la pelota interactiva?',
      a: `<p>La pelota interactiva NUBIK se mueve sola y tiene tres modos de funcionamiento, para que tu gato tenga distintas opciones de juego. Necesita estar cargada para funcionar.</p>` },
    { q: '¿Cuántos modos tiene?',
      a: `<p>Tiene tres modos de funcionamiento. Si quieres saber más sobre cada uno antes de comprar, escríbenos por WhatsApp.</p>` },
    { q: '¿Qué incluye la caja de la pelota?',
      a: `<p>La pelota interactiva y su cargador. Recuerda cargarla antes de usarla por primera vez.</p>` },
    { q: '¿Cómo se utiliza el guante quitapelos?',
      a: `<p>Te pones el guante en la mano y lo pasas sobre el pelaje de tu perro o gato durante su rutina de cuidado, para ayudar a retirar el pelo suelto.</p>` },
    { q: '¿Puedo comprar el guante quitapelos por separado?',
      a: `<p>No. El guante quitapelos se ofrece únicamente dentro del Combo NUBIK, junto con la pelota interactiva.</p>` },
    { q: '¿Qué incluye el combo?',
      a: `<p>El Combo NUBIK incluye una pelota interactiva (con su cargador) y un guante quitapelos, por ${money(combo)} COP con envío gratis. La pelota también está disponible sola por ${money(ball)} COP.</p>` },
    { q: '¿Cuánto tarda el envío?',
      a: `<p>Los tiempos son estimados y se cuentan en días hábiles desde el despacho: ${est}. La fecha exacta de entrega depende de la transportadora, por eso no podemos garantizarla.</p><p><a class="link" href="/envios-y-garantias">Ver horarios de despacho</a></p>` },
    { q: '¿El envío tiene algún costo?',
      a: `<p>No. El envío es gratis para ti: NUBIK asume su costo.</p>` },
    { q: cfg.payments.transferReady ? '¿Qué medios de pago aceptan?' : '¿Qué medios de pago estarán disponibles?',
      a: cfg.payments.transferReady
        ? `<p>Por ahora recibimos pagos por <strong>transferencia bancaria</strong>: al registrar tu pedido te mostramos los datos de la cuenta y el valor exacto. Tu pedido se confirma cuando verificamos el pago. No ofrecemos pago contra entrega.</p>`
        : `<p>Están previstos transferencia bancaria y tarjeta. <strong>Los pagos online todavía están pendientes de habilitación</strong>; mientras tanto puedes registrar tu solicitud de pedido y coordinar el pago por WhatsApp. No ofrecemos pago contra entrega.</p>` },
    { q: '¿Cómo puedo consultar sobre mi pedido?',
      a: `<p>Escríbenos por WhatsApp al <a class="link" href="${cfg.contact.whatsappUrl}" target="_blank" rel="noopener">${cfg.contact.whatsappDisplay}</a> e indícanos tu número de solicitud (empieza por NBK-).</p>` },
    { q: '¿Cómo funciona la garantía?',
      a: `<p>${cfg.warranty.summary} Mientras publicamos la política definitiva, si tu producto presenta un problema escríbenos por WhatsApp y te indicaremos el procedimiento.</p><p>Esta cobertura comercial no limita los derechos de garantía que te reconoce la ley colombiana como consumidor.</p><p><a class="link" href="/envios-y-garantias#garantia">Ver detalles</a></p>` },
    { q: '¿Qué incluye el Dúo de pelotas?',
      a: `<p>Dos pelotas interactivas NUBIK, cada una con su cargador, por ${money(products['duo-pelotas'].price)} COP con envío gratis. Es ideal si tienes dos gatos o si quieres tener una pelota lista mientras la otra se carga.</p>` },
  ];
}

const DEPTS = ['Amazonas','Antioquia','Arauca','Atlántico','Bogotá D.C.','Bolívar','Boyacá','Caldas','Caquetá','Casanare','Cauca','Cesar','Chocó','Córdoba','Cundinamarca','Guainía','Guaviare','Huila','La Guajira','Magdalena','Meta','Nariño','Norte de Santander','Putumayo','Quindío','Risaralda','San Andrés y Providencia','Santander','Sucre','Tolima','Valle del Cauca','Vaupés','Vichada'];
export const departamentos = DEPTS;

const REVIEW = `<div class="review-banner" role="note"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg><div><strong>Borrador pendiente de revisión legal.</strong> Este texto es una estructura de trabajo y no ha sido aprobado. Los campos entre corchetes deben completarse con información confirmada antes de su publicación definitiva.</div></div>`;

export function legal(page, cfg, products) {
  const wa = `<a class="link" href="${cfg.contact.whatsappUrl}" target="_blank" rel="noopener">${cfg.contact.whatsappDisplay}</a>`;
  const mail = cfg.contact.customerServiceEmail || '[correo de atención de NUBIK — pendiente]';
  const pages = {
    privacidad: { title: 'Política de privacidad', body: `
      ${REVIEW}
      <h2>1. Responsable del tratamiento</h2>
      <p>NUBIK — [razón social, NIT, domicilio y dirección — pendientes]. Canal de contacto: WhatsApp ${wa}. Correo: ${mail}.</p>
      <h2>2. Datos que recogemos</h2>
      <p>Solo los necesarios para gestionar tu solicitud de pedido: nombre, celular, correo electrónico (opcional), departamento, ciudad, dirección de entrega y las notas que decidas escribir. <strong>No recogemos datos de tarjetas</strong>: cuando se habiliten los pagos online, esos datos se ingresarán únicamente en la plataforma oficial de la pasarela de pagos.</p>
      <h2>3. Finalidades</h2>
      <ul><li>Gestionar, confirmar y despachar tu pedido.</li><li>Comunicarnos contigo sobre el estado del pedido, el pago, la entrega y la garantía.</li><li>Compartir los datos de entrega estrictamente necesarios con el proveedor y la transportadora para el despacho.</li><li>[Otras finalidades — pendientes de definir; p. ej. comunicaciones comerciales, solo con autorización expresa].</li></ul>
      <h2>4. Derechos del titular</h2>
      <p>Conforme a la normativa colombiana de protección de datos personales (Ley 1581 de 2012 y normas reglamentarias), puedes conocer, actualizar, rectificar y solicitar la supresión de tus datos, así como revocar la autorización otorgada. [Procedimiento y plazos de atención — pendientes de revisión].</p>
      <h2>5. Conservación y seguridad</h2>
      <p>[Plazo de conservación y medidas de seguridad — pendientes de definir].</p>
      <h2>6. Cambios a esta política</h2>
      <p>[Fecha de entrada en vigor y versión — pendientes].</p>` },
    terminos: { title: 'Términos y condiciones', body: `
      ${REVIEW}
      <h2>1. Identificación</h2>
      <p>Tienda online NUBIK — [razón social, NIT y domicilio — pendientes].</p>
      <h2>2. Productos y precios</h2>
      <p>Los precios se expresan en pesos colombianos (COP). Pelota interactiva NUBIK: ${money(products['pelota-interactiva'].price)} COP. Combo NUBIK (pelota interactiva + guante quitapelos): ${money(products['combo-nubik'].price)} COP. Dúo de pelotas interactivas (2 pelotas, cada una con su cargador): ${money(products['duo-pelotas'].price)} COP. El guante quitapelos no se vende individualmente. [Tratamiento de impuestos — pendiente de confirmar].</p>
      <h2>3. Proceso de compra</h2>
      <p>Al finalizar el formulario registras una <strong>solicitud de pedido</strong>. La solicitud no implica pago ni confirmación: el pedido se considera confirmado únicamente cuando NUBIK verifica el pago y te lo comunica. Los pagos online están pendientes de habilitación. No se ofrece pago contra entrega.</p>
      <h2>4. Envíos</h2>
      <p>El envío es gratis para el cliente dentro de Colombia. Los tiempos de entrega son estimados y dependen de la transportadora. Consulta <a class="link" href="/envios-y-garantias">Envíos y garantías</a>.</p>
      <h2>5. Garantía, cambios y retracto</h2>
      <p>Consulta <a class="link" href="/cambios-y-devoluciones">Cambios y devoluciones</a>. Estas condiciones no limitan los derechos del consumidor previstos en la ley colombiana (Estatuto del Consumidor, Ley 1480 de 2011).</p>
      <h2>6. Ley aplicable y contacto</h2>
      <p>[Pendiente de revisión legal]. Contacto: WhatsApp ${wa}.</p>` },
    cambios: { title: 'Cambios y devoluciones', body: `
      ${REVIEW}
      <h2>1. Garantía informada por el proveedor</h2>
      <p>${cfg.warranty.summary}</p>
      <p>Puntos que NUBIK está confirmando por escrito antes de publicar la política definitiva:</p>
      <ul>${cfg.warranty.pendingConfirmation.map(x => `<li>${x}</li>`).join('')}</ul>
      <h2>2. Tus derechos como consumidor</h2>
      <p>La cobertura comercial informada por el proveedor no reemplaza ni limita la garantía legal ni los demás derechos que te reconoce el Estatuto del Consumidor (Ley 1480 de 2011), incluido el derecho de retracto en ventas a distancia en los términos que establece la ley. [Redacción definitiva — pendiente de revisión legal].</p>
      <h2>3. Cambios y devoluciones</h2>
      <p>[Condiciones de cambio, plazos, estado del producto, quién asume el costo del envío de retorno y forma de reembolso — pendientes de definir. No se publican condiciones no confirmadas].</p>
      <h2>4. Cómo iniciar una solicitud</h2>
      <p>Escríbenos por WhatsApp ${wa} con tu número de solicitud (NBK-…) y una descripción del caso. Te indicaremos los pasos a seguir.</p>` },
  };
  return pages[page];
}
