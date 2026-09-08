import { vi } from "vitest";

// Vitest corre el dominio en Node sin el resolvedor de Next. La barrera del bundle se verifica
// en build/E2E; dentro de estas pruebas de servidor el marcador no debe lanzar al importar.
vi.mock("server-only", () => ({}));
