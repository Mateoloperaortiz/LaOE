// Cada módulo registra sus handlers al importarse. Agregar aquí los jobs.ts de los módulos nuevos.
import "@/modules/comms/jobs";
import "@/modules/crm/jobs";
import "@/modules/forms/jobs";
import "@/modules/identity/jobs";
import "@/modules/inventory/jobs";
import "@/modules/participation/jobs";
import "@/modules/people/jobs";
import "@/modules/permanence/jobs";
import "@/modules/system/jobs";
import "@/modules/wallet/jobs";
// `content` va de último a propósito: los handlers de un evento corren en el orden en que se registran,
// y el suyo de `person.anonymized` borra del bucket (ADR-116 regla 8). Si el bucket falla, la limpieza
// de los demás módulos ya quedó hecha y solo las fotos esperan el reintento.
import "@/modules/content/jobs";
