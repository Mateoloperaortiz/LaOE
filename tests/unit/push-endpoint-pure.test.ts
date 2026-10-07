import { parse } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isKnownPushEndpoint,
  MAX_DEVICES_PER_PERSON,
  PUSH_SERVICES,
} from "@/modules/comms/domain/push-endpoint-pure";
import { t } from "@/shared/copy";

const KNOWN = [
  "https://fcm.googleapis.com/fcm/send/cXVlLXBhc2E6QVBBOTFiRi1f",
  "https://fcm.googleapis.com/wp/dGVzdA",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABm-_x",
  "https://web.push.apple.com/QGkz1nJ2",
  "https://wns2-by3p.notify.windows.com/w/?token=BQYAAAC%2fx%2b",
  "https://db5p.notify.windows.com/w/?token=x",
  "https://a.b.notify.windows.com/w/?token=x",
];

describe("servicios de push conocidos (ADR-113 regla 6)", () => {
  it("admite el endpoint https de cada servicio de la lista", () => {
    for (const endpoint of KNOWN) {
      expect(isKnownPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("cada servicio de la lista tiene al menos un endpoint que pasa", () => {
    for (const service of PUSH_SERVICES) {
      const host = service.host.replace("*.", "ejemplo.");
      expect(isKnownPushEndpoint(`https://${host}/x`), service.name).toBe(true);
    }
  });

  it("rechaza otro host, aunque nombre a uno conocido en otra parte de la dirección", () => {
    for (const endpoint of [
      "https://push.example/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/x",
      "https://googleapis.com/fcm/send/x",
      "https://xfcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com.push.example/fcm/send/x",
      "https://push.example/fcm.googleapis.com/x",
      "https://push.example/?u=https://fcm.googleapis.com/fcm/send/x",
      "https://push.example/#https://fcm.googleapis.com/fcm/send/x",
      "https://sub.fcm.googleapis.com/fcm/send/x",
      "https://push.services.mozilla.com/wpush/v2/x",
      "https://push.apple.com/x",
    ]) {
      expect(isKnownPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it("el comodín pide un subdominio de verdad", () => {
    for (const endpoint of [
      "https://notify.windows.com/w/?token=x",
      "https://.notify.windows.com/w/?token=x",
      "https://x..notify.windows.com/w/?token=x",
      "https://evilnotify.windows.com/w/?token=x",
      "https://wns2.notify.windows.com.push.example/w/?token=x",
      "https://wns2.notify.windows.co/w/?token=x",
    ]) {
      expect(isKnownPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it("rechaza lo que no es https, trae credenciales o trae puerto", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/x",
      "ftp://fcm.googleapis.com/fcm/send/x",
      "//fcm.googleapis.com/fcm/send/x",
      "fcm.googleapis.com/fcm/send/x",
      "https://usuario@fcm.googleapis.com/fcm/send/x",
      "https://usuario:clave@fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com:8443/fcm/send/x",
      "https://fcm.googleapis.com@push.example/fcm/send/x",
    ]) {
      expect(isKnownPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it("rechaza la dirección que hubo que normalizar para entenderla", () => {
    for (const endpoint of [
      "https://FCM.googleapis.com/fcm/send/x",
      "HTTPS://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com:443/fcm/send/x",
      "https://fcm.googleapis.com./fcm/send/x",
      "https://fcm.googleapis.com\\@push.example/x",
      "https:\\\\fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com/fcm/send/x\n",
      " https://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com/fcm/\tsend/x",
      "https://fcm.googleapis.com",
      "",
    ]) {
      expect(isKnownPushEndpoint(endpoint), JSON.stringify(endpoint)).toBe(false);
    }
    expect(isKnownPushEndpoint(undefined as never)).toBe(false);
    expect(isKnownPushEndpoint({ href: KNOWN[0] } as never)).toBe(false);
  });

  it("el analizador con el que `web-push` arma el envío lee el mismo host que se comprobó", () => {
    for (const endpoint of KNOWN) {
      const checked = new URL(endpoint);
      const sent = parse(endpoint);
      expect(sent.hostname, endpoint).toBe(checked.hostname);
      expect(sent.port, endpoint).toBeNull();
      expect(sent.protocol, endpoint).toBe("https:");
      expect(sent.auth, endpoint).toBeNull();
    }
  });

  it("el texto del tope dice el mismo número que la constante", () => {
    expect(MAX_DEVICES_PER_PERSON).toBe(10);
    expect(t("T-3209")).toContain(`${MAX_DEVICES_PER_PERSON} dispositivos`);
  });
});
