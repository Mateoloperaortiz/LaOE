// El drenado de las pruebas vive junto al poller (`src/jobs/testing.ts`); acá queda la puerta por la que
// lo toman integración y E2E.
export { drainOutbox } from "@/jobs/testing";
