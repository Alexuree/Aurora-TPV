# VERI*FACTU y modo offline

Este proyecto ya tiene una base interna para operar en modo `NO-VERIFACTU`: series, tipo de factura, hash encadenado local, snapshot del cliente y auditoria. Eso no equivale a cumplimiento VERI*FACTU certificado.

## Lo necesario para VERI*FACTU real

Para convertir el TPV en un sistema VERI*FACTU real hace falta implementar y validar, como minimo:

1. Generacion del registro de facturacion conforme al formato publicado por AEAT.
2. Huella/hash con los campos exactos exigidos por AEAT, no solo un hash interno de control.
3. Encadenamiento inalterable de registros por serie y emisor.
4. Firma o mecanismo de integridad conforme a la normativa aplicable al sistema informatico de facturacion.
5. Codigo QR con la URL y parametros oficiales de contraste AEAT.
6. Leyenda fiscal correcta en factura/ticket cuando proceda.
7. Envio automatico a AEAT en modo VERI*FACTU y gestion de respuestas, errores, rechazos y reintentos.
8. Registro de eventos: alta, anulacion/subsanacion, errores de envio, reintentos, cambios de configuracion y acceso a datos fiscales.
9. Politica de no alteracion: una factura emitida no debe editarse libremente; las correcciones deben hacerse mediante registros/facturas rectificativas o el mecanismo legal equivalente.
10. Gestion formal de facturas simplificadas, completas y rectificativas con series separadas si aplica.
11. Exportacion y conservacion de registros durante el plazo legal.
12. Backups, control de acceso, trazabilidad de usuarios y proteccion RGPD.
13. Validacion con el entorno de pruebas de AEAT antes de produccion.
14. Revision legal/fiscal del flujo final por asesor o proveedor especializado.

## Sobre asignar cliente a una venta cerrada

La app permite asociar un cliente a un ticket ya cerrado para reimprimirlo con sus datos fiscales. Esta operacion no recalcula importes, pagos ni caja.

Para VERI*FACTU real no debe tratarse como una simple edicion silenciosa de una factura ya emitida. Hay que definir juridicamente si es:

1. completado de una factura simplificada dentro de un flujo permitido,
2. emision de una factura completa vinculada al ticket original,
3. factura rectificativa o sustitutiva,
4. o una operacion no permitida segun el estado fiscal del registro original.

Hasta que ese flujo este cerrado legalmente, la funcionalidad debe considerarse operativa para reimpresion interna/NO-VERIFACTU, no como cumplimiento VERI*FACTU final.

## Modo offline con sincronizacion automatica

El enfoque correcto para este TPV no es mantener una base de datos local completa paralela a Supabase. La base de datos oficial sigue siendo Supabase. Si se cae la conexion, el TPV solo guarda temporalmente las operaciones que no pudo enviar y las elimina del almacenamiento local en cuanto Supabase las acepta.

Implementado actualmente:

1. En modo Supabase, si una venta falla por conexion, `processSale` guarda una operacion temporal en `localStorage`.
2. La venta queda visible como `Pendiente envio` en el historial para que el dependiente sepa que aun no ha subido.
3. Al recuperar la conexion (`online`) se reintenta enviar automaticamente a Supabase.
4. Cuando Supabase confirma la venta, la operacion pendiente se borra del TPV local.
5. Si el envio vuelve a fallar, se conserva temporalmente con numero de intentos y ultimo error para reintentar despues.

Limitaciones pendientes para produccion avanzada:

1. Hacer las operaciones idempotentes en servidor con una clave `client_operation_id`, para blindar reintentos contra duplicados.
2. Mostrar un indicador global de conexion y contador de operaciones pendientes.
3. Decidir reglas para anulaciones, cierres de caja y cambios fiscales mientras haya ventas pendientes.
4. Validar el flujo fiscal: mientras una venta esta pendiente, su numeracion visible es temporal (`PEND-*`) y Supabase asigna la numeracion definitiva al sincronizar.
5. Probar cortes de red, reinicio de la app, doble click de cobro, reloj desfasado y varios terminales.

La regla importante: el almacenamiento local es una bandeja temporal de salida, no una segunda base de datos. La fuente final de verdad es Supabase cuando vuelve la conexion.
