import type { Actor } from "@/modules/identity";

export interface WalletCall {
  url: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  init: RequestInit;
}

/** El servidor falso conserva objetos entre llamadas y aplica PUT como reemplazo completo. */
export class FakeGoogleWallet {
  readonly classes = new Map<string, Record<string, unknown>>();
  readonly objects = new Map<string, Record<string, unknown>>();
  readonly calls: WalletCall[] = [];
  intercept: ((call: WalletCall) => Promise<Response | undefined>) | undefined;

  transport = async (url: string, init: RequestInit): Promise<Response> => {
    const oauth = url === "https://oauth2.googleapis.com/token";
    const path = oauth ? "/oauth" : new URL(url).pathname.replace("/walletobjects/v1", "");
    const call: WalletCall = {
      url,
      path,
      method: init.method ?? "GET",
      body: oauth || !init.body ? {} : JSON.parse(String(init.body)),
      init,
    };
    this.calls.push(call);
    const response = await this.intercept?.(call);
    if (response) return response;
    if (oauth) return Response.json({ access_token: "oauth-sintetico", expires_in: 3600 });
    const [kind, identifier] = path.slice(1).split("/");
    const data = kind === "genericClass" ? this.classes : this.objects;
    const id = identifier ? decodeURIComponent(identifier) : String(call.body.id);
    const existing = data.get(id);
    if (call.method === "GET") {
      return existing ? Response.json(existing) : Response.json({}, { status: 404 });
    }
    if (call.method === "POST") {
      if (existing) return Response.json({}, { status: 409 });
      data.set(id, structuredClone(call.body));
      return Response.json(call.body);
    }
    if (!existing) return Response.json({}, { status: 404 });
    const next = call.method === "PATCH" ? { ...existing, ...call.body } : call.body;
    data.set(id, structuredClone(next));
    return Response.json(next);
  };

  writes(): WalletCall[] {
    return this.calls.filter(
      (call) => call.path.startsWith("/genericObject") && call.method !== "GET",
    );
  }
}

export function walletActor(personId: string): Actor {
  return {
    personId,
    sessionId: "sesion-sintetica",
    email: "wallet-sintetica@eafit.edu.co",
    name: "Persona",
    firstName: "Persona",
    membershipStatus: "ACTIVE",
    permissions: [],
    otpVerifiedAt: new Date(),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin: false,
  };
}

export function walletBarrier() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
