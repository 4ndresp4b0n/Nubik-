"""
Punto único de integración de la pasarela de pagos.

Estado: NINGUNA pasarela configurada. Mientras PAYMENT_PROVIDER no esté definido,
start_payment() devuelve {"enabled": False} y el frontend muestra que el pago online
está pendiente de habilitación. Nunca se simula una transacción.

Para integrar una pasarela compatible con Colombia (p. ej. Wompi, ePayco, Mercado Pago, PayU):
  1. Define PAYMENT_PROVIDER y las llaves como VARIABLES DE ENTORNO del servidor
     (nunca en el frontend ni en el repositorio).
  2. Implementa start_payment(): crea la transacción / checkout con el SDK o API
     oficial usando el total recalculado en el servidor (order["priced"]["total"])
     y devuelve la URL o los parámetros firmados del widget oficial.
  3. Implementa el webhook (/api/payments/webhook en server.py): verifica la firma
     del evento con el secreto de la pasarela y consulta el estado de la transacción
     en su API antes de marcar el pedido como pagado.
  4. La página de resultado debe consultar el estado real en el servidor; nunca
     mostrar "pago exitoso" solo por un parámetro de la URL.
Los datos de tarjeta deben capturarse exclusivamente en el formulario/widget oficial
de la pasarela, no en formularios propios.
"""
import os


def provider_name():
    return os.environ.get("PAYMENT_PROVIDER") or None


def enabled() -> bool:
    return False  # cambiar solo cuando exista una integración real y probada


def start_payment(order: dict) -> dict:
    return {
        "enabled": False,
        "message": "Los pagos online están pendientes de habilitación: coordina el pago con NUBIK por WhatsApp.",
    }
