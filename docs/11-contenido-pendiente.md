# Contenido que la OE debe aportar

Sin esto el sitio queda bonito y vacío. Se marca cuando el material está en manos de Mateo y con permiso de uso. Los textos de la interfaz, correos y notificaciones están inventariados uno por uno en [14-copy-y-textos.md](14-copy-y-textos.md), con quién debe escribir cada uno.

## Personas

- [ ] Roster del término con las columnas acordadas: `NOMBRE`, `APELLIDO`, `CORREO`, `CELULAR`, `PREGRADO`, `COMITES`, `ENTRADA A LA OE`, `ESTADO` y la nueva `CARGO` ([13-importacion-del-roster.md](13-importacion-del-roster.md)); GH lo envía cuando termine de limpiar su base
- [x] Vocabulario de `ESTADO` (Activo, Licencia, Honorario, Retirado, Prueba) y lista de cargos (seis), confirmados por GH
- [ ] Segunda entrega con `CORREO` y `CARGO` para completar los cargos (la base actual no los tiene)
- [ ] Lista de líderes de comité y cargos de junta del término actual
- [ ] Quién tendrá permiso ADMIN además de Mateo

## Comités

- [ ] Texto de presentación de cada uno de los 27 comités (2 a 4 párrafos)
- [ ] Contacto o enlace de cada comité (Instagram, correo, WhatsApp)
- [ ] Confirmar que la lista de 27 comités con logo sigue vigente (comités nuevos o cerrados)
- [ ] Nombre oficial de cada comité: el seed sintético y la primera carga usan la sigla del logo en mayúsculas como nombre provisional

## Eventos

- [ ] Descripción de cada macroevento: Días EAFIT, Inventiva, EnFemenino, Subsidios-OE
- [ ] Fechas reales de la próxima edición de cada uno (no se inventan)
- [ ] Portadas o fotos con permiso de uso; sin fotos de personas sin consentimiento

## Normativa y privacidad

- [x] Estatutos vigentes en PDF: el firmado con la reforma del 2026-05-08 (28 páginas) está en manos de Mateo; se sube desde `/admin/documentos` y sus artículos se extraen con `scripts/normativa-extract.py` en la fase 2
- [x] Reglamento vigente en PDF: el firmado con la reforma del 2026-05-08 (43 páginas, con el Anexo 1) está en manos de Mateo; mismo camino
- [ ] Texto de la política de tratamiento de datos personales ya aprobada (documento o PDF) y nombre del responsable del tratamiento; confirmar que cubre la galería de egresados y el contacto posterior a la salida; su versión es la que se guarda en `privacy.policyVersion` (hoy "pendiente") y la que registran los consentimientos
- [ ] Correo de salida voluntaria (T-206) y correo a los importados (T-201): sin texto final la app no los envía

## Marca

- [x] Logos de los 27 comités en SVG monocromo: ya están en `LaOE/public/logos/committees` (pasan al repositorio en la fase 0)
- [x] Logo vertical de la OE como máscara monocroma (`oe.svg`): sirve para las variantes navy y blanca
- [x] Fuentes: la OE no tiene licencias; se usan Sofia Sans Extra Condensed y Plus Jakarta Sans (decisión cerrada el 2026-09-02)
- [x] Isotipo como favicon e ícono de PWA: aprobado
- [ ] Logo horizontal en SVG (el manual lo llama "menos utilizado"; sirve para la barra de navegación). Mientras no exista, se usa el vertical a tamaño pequeño
- [ ] Logo principal a color en SVG (con sus azules propios) para pie de página y carnet; hoy solo existe la máscara monocroma
- [ ] Texturas oficiales (papel, granito) en alta resolución si existen; si no, se usan las generadas en la web

## Permanencia

- [x] Tabla general de permanencia del término (recibida en capturas; GH confirmó que vale unos 50 puntos)
- [x] Reparto entre tablas y regla para varios comités (general ≈ 50, comité ≈ 60, resultado por comité)
- [x] Lista de comités de trabajo con su significado y sus líderes (falta el Athletic)
- [x] Quién evalúa cada grupo (directores de GH; nuevos, el GH principal)
- [ ] Tablas de permanencia de los 27 comités del término (ejemplo recibido: A3, con los eventos 1 y 2 aún sin peso)
- [ ] Lista de directores de GH por frente (GH la envía cuando termine de limpiar su base)
- [ ] Nombres del capitán y el DT del Athletic
- [ ] Calendario de integraciones y de partidos del Athletic del término (mientras no esté, las reglas usan 10 integraciones y 3 partidos esperados, como dijo GH)
- [ ] Confirmar con GH los supuestos de la fase 4: prueba con transferencia usa 80 %; en licencia y honorarios no se evalúan; las evaluaciones pendientes al cerrar cuentan como no logradas; el aviso del nominal salta a 5 puntos
- [ ] Descripción de una línea de cada criterio de la tabla general (T-126) y de los criterios de cada comité
- [ ] Textos sensibles del cierre: periodo de prueba (T-203) y salida (T-204), que hoy GH comunica en persona porque la app no manda correos hasta la fase 6

## Operación

- [ ] Puntos por tipo de ocasión para el término (tope de comités y asambleas ya están decididos)
- [ ] Fechas de las dos asambleas ordinarias (una sola es obligatoria) y, en el segundo semestre, de la elección de junta
- [ ] Nombres y cortes de los niveles de GH Points (T-082); mientras tanto rigen los propuestos (0, 100, 250, 500, 1000)
- [ ] Al migrar desde GHPOINTS: las actividades que quedaron abiertas allá (31 en la copia local) llegan abiertas y el cierre automático las cierra en la primera hora; confirmar con GH si alguna debe seguir recibiendo registros a mano antes del cutover
- [ ] Texto de "Unirse": requisitos y fechas de convocatoria
- [ ] Preguntas reales del formulario de admisión (el seed trae unas sintéticas) y el texto de gracias que ve quien postula
- [ ] Etapas reales del proceso de admisión si difieren de la plantilla (Recibida, Entrevista, Admitida, Alta, No admitida) y de la de patrocinio (Contacto, Propuesta, Negociación, Cerrado, Sin acuerdo)
- [ ] Aliados y contactos institucionales reales (empresas, unidades de EAFIT, grupos estudiantiles) con permiso para cargarlos; montos y contraprestaciones de los patrocinios vigentes
- [ ] Cupos y ventanas de las convocatorias internas del término (GT, GAP, GAP OE, barra brava, tareas de nuevos)
- [ ] Confirmar con GH los supuestos de la fase 5: cinco días hábiles para responder una solicitud; el cambio de comité aprobado rige desde el semestre siguiente como transferencia; la casilla de un formulario público es consentimiento de tratamiento de datos y el de membresía se registra al dar de alta; el retiro voluntario aprobado avisa con T-205 mientras T-206 no tenga texto final
- [ ] Pasos del onboarding de nuevos (qué debe hacer un nuevo en su primera semana) y preguntas de la encuesta corta tras una ocasión
- [ ] Acceso al dominio `oeeafit.com` (DNS) y a la cuenta de Resend
- [ ] Subdominio `pruebas.oeeafit.com` para `staging` (opcional; el dominio de Railway sirve mientras tanto)
