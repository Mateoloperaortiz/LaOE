// Service worker de Mi OE (ADR-038 regla 4): recibe el push, muestra la notificación y abre la URL.
// Sin caché ni handler de fetch: la app sigue exigiendo red (el modo sin señal está en el backlog).
// Al cambiar este archivo, subí la versión para que el navegador lo reinstale.
const VERSION = "2026-09-05.1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Mi OE", body: "", url: "/app", tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Un push sin cuerpo JSON abre Mi OE con el título por defecto.
  }
  const options = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: data.url, version: VERSION },
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const same = windows.find((client) => client.url === target && "focus" in client);
      if (same) {
        return same.focus();
      }
      const open = windows.find((client) => "navigate" in client && "focus" in client);
      if (open) {
        return open.navigate(target).then((client) => (client ? client.focus() : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});

// El servicio de push renovó la suscripción: se vuelve a suscribir con la misma clave y se avisa al servidor.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) {
    return;
  }
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .then((subscription) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        }),
      ),
  );
});
