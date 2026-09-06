# ADR-015: Canales de comunicación

- Estado: Aceptada (enmendada por ADR-023 y ADR-038)
- Fecha: 2026-09-02
- Relacionadas: ADR-010, ADR-012, ADR-019

## Contexto

Resend gratis permite 3.000 correos al mes y 100 al día. La OE tiene unas 700 personas; una campaña por correo agota el día. Los miembros viven en el celular.

## Decisión

Cartelera + push web (PWA instalada, VAPID) es el canal principal para miembros. El correo queda para lo transaccional (OTP, puntos acreditados, recordatorios) y para campañas segmentadas enviadas en lotes programados dentro del límite del proveedor, con enlace de baja en lo no transaccional. WhatsApp solo como enlaces click-to-chat desde la ficha. Sin webhook de Teams. Todo envío se registra en `Message` y respeta `NotificationPreference`.

## Consecuencias

- Un anuncio llega al celular sin gastar cuota de correo.
- Si un día de evento supera 100 OTP, el adaptador `Mailer` cambia a SES sin tocar el dominio.

## Enmienda (2026-09-02, ADR-023)

El cambio a SES es automático: desde 95 correos en el día, o ante un error de cuota de Resend, el mismo mensaje sale por SES. Las campañas salen siempre por SES. Ver [ADR-023](ADR-023-operacion-entornos-respaldo-correo.md).

## Enmienda (2026-09-05, ADR-038)

Reglas concretas: cada push respeta la preferencia de su tipo (`pushAnnouncements`, `pushPoints`, `pushReminders`); lo transaccional llega siempre. Las campañas por correo llegan por defecto a activos, en licencia y honorarios (con baja en un clic) y a egresados y externos solo con consentimiento `COMMUNICATIONS` vivo; salen por el transporte de desbordamiento (SES) cuando existe. Los avisos y recordatorios van solo por push; por correo salen únicamente los textos que existen (T-200, T-202, T-205). Ver [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md).
