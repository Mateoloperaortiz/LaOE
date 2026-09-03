# Casa digital de la OE

Documentación de la nueva casa digital de la **Organización Estudiantil de la Universidad EAFIT (OE)**: portal público con la línea gráfica oficial, **Mi OE** para el roster, **Participación y GH Points**, y un **CRM de comunidad** para personas, admisión, egresados, aliados y contactos institucionales. Una sola aplicación que reemplaza a GHPOINTS, el sistema que hoy sirve [oeeafit.com](https://oeeafit.com).

## Estado

**Fase 0 en curso** desde el 3 de septiembre de 2026: el código base ya corre completo en local (scaffold, datos, marca, acceso por OTP, outbox, admin kit y seed sintético; ver el [roadmap](docs/09-roadmap.md), que es el archivo de seguimiento). Falta la parte B de la fase: repositorio en GitHub, entorno `staging` en Railway y cuentas de correo y respaldo.

Versión de la documentación: 3 de septiembre de 2026.

## Un solo lugar

Una app, una base de datos, un bucket, un admin y un proveedor de correo. Todo lo que hoy vive disperso (Excel del roster, Microsoft Forms, la app de GH Points, tres formas de iniciar sesión, enlaces sueltos) entra en un mismo producto. El detalle está en [docs/00-vision.md](docs/00-vision.md).

## Cómo correr en local

Requisitos: Node 24 (`.node-version`), npm 11 y [OrbStack](https://orbstack.dev) (provee `docker` y `docker compose`).

```bash
cp .env.example .env        # valores locales; SESSION_SECRET real con: openssl rand -hex 32
npm install                 # instala dependencias y los hooks de git (lefthook)
npm run db:up               # Postgres 18 en 127.0.0.1:5433 y Garage (bucket S3) en 127.0.0.1:3900
npm run storage:init        # crea el bucket `media` si falta y aplica su CORS
npm run db:reset            # esquema desde cero + datos sintéticos
npm run dev                 # http://localhost:3000 · salud en /api/health
```

Las pruebas de integración usan una base aparte (`casa_digital_test`, creada y migrada sola); las e2e (`npm run test:e2e`) corren contra el dev server y su base. `npm run check` corre todo lo que corre el CI: Biome, dependency-cruiser, knip, `tsc`, pruebas unitarias, pruebas de integración contra la base local y `next build`. Cómo se prueba cada capa: [docs/10-verificacion.md](docs/10-verificacion.md).

## Cómo leer la documentación

| Archivo | Para qué |
| --- | --- |
| [00-vision.md](docs/00-vision.md) | Contexto, decisiones cerradas, alcance y lo que queda fuera |
| [01-arquitectura.md](docs/01-arquitectura.md) | Monolito modular en Railway (web con worker en proceso, Postgres, bucket), módulos, jobs, layout del código, costo |
| [02-crm.md](docs/02-crm.md) | El CRM de comunidad: persona, etapas, Persona 360, pipelines, privacidad |
| [03-modelo-de-datos.md](docs/03-modelo-de-datos.md) | Modelos, relaciones y restricciones |
| [04-decisiones.md](docs/04-decisiones.md) y [adr/](docs/adr/README.md) | Las reglas del sistema, una ADR por archivo |
| [05-acceso.md](docs/05-acceso.md) | Quién entra y cómo |
| [06-mapa-del-sitio.md](docs/06-mapa-del-sitio.md) | Rutas del portal, Mi OE y administración |
| [07-marca.md](docs/07-marca.md) | Tokens de la línea gráfica y reglas de uso |
| [08-migracion-ghpoints.md](docs/08-migracion-ghpoints.md) | Cómo se traen los datos y se apaga GHPOINTS |
| [09-roadmap.md](docs/09-roadmap.md) | Fases con checklists: **aquí se hace el seguimiento** |
| [10-verificacion.md](docs/10-verificacion.md) | Cómo se prueba cada capa |
| [11-contenido-pendiente.md](docs/11-contenido-pendiente.md) | Lo que la OE debe aportar |
| [12-permanencia.md](docs/12-permanencia.md) | La tabla de permanencia de GH como tablero: reglas por término, grupos de trabajo, evaluaciones y progreso del miembro |
| [13-importacion-del-roster.md](docs/13-importacion-del-roster.md) | Formato del archivo del roster, validaciones y qué hace la importación |
| [14-copy-y-textos.md](docs/14-copy-y-textos.md) | Todos los textos de la app con propuesta, dueño y estado, para que GH, comunicaciones y los comités pongan los suyos |
| [decisiones-abiertas.md](docs/decisiones-abiertas.md) | Preguntas sin cerrar |
| [glosario.md](docs/glosario.md) | Términos de la interfaz y del código |

## Relación con GHPOINTS

GHPOINTS (repositorio hermano, `../GHPOINTS`) sigue en producción hasta el cutover. Esta casa digital lo reemplaza con código y reglas nuevas; sus datos (roster, ledger, asistencias, ediciones) se migran por script y los QR impresos siguen funcionando mediante alias. Ver [08-migracion-ghpoints.md](docs/08-migracion-ghpoints.md).

## Cómo se hace seguimiento

1. Cada entregable de una fase es una casilla en [09-roadmap.md](docs/09-roadmap.md); se marca cuando cumple su criterio de "listo cuando" y se anota en el registro de avances del mismo archivo.
2. Toda regla nueva o cambiada es una ADR en [docs/adr/](docs/adr/README.md); una regla vieja no se edita, se reemplaza por otra que la referencia.
3. Lo que no está decidido vive en [decisiones-abiertas.md](docs/decisiones-abiertas.md) hasta que se cierra con fecha y pasa a [00-vision.md](docs/00-vision.md) o a una ADR.
4. Los avances quedan en el historial de git de este repositorio.
