# Credenciales de prueba del carnet

`toy-credentials.json` contiene claves privadas deliberadamente públicas y desechables. Solo sirven para pruebas automatizadas: no son credenciales reales de Google ni certificados Apple válidos. La codificación base64 facilita el fixture; no oculta secretos ni garantiza que un detector de secretos lo ignore. Nunca copiar estos valores a Railway.

Se generaron en un directorio temporal con OpenSSL; la CA de juguete firma el certificado de juguete para comprobar criptográficamente el CMS y su cadena. Los archivos originales temporales se eliminan después de convertirlos a base64.

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -subj '/CN=OE Test CA/OU=TEST ONLY' -keyout wwdr.key -out wwdr.crt
openssl req -new -newkey rsa:2048 -nodes -subj '/CN=Pass Type ID: pass.test.oe/OU=TESTTEAM00/O=OE Test' -keyout signer.key -out signer.csr
openssl x509 -req -in signer.csr -CA wwdr.crt -CAkey wwdr.key -set_serial 1 -days 36500 -out signer.crt
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out google.key
openssl pkey -in google.key -pubout -out google.pub
```

El JSON guarda el contenido PEM en base64: `wwdr.crt` → `wwdr`, `signer.crt` → `signerCert`, `signer.key` → `signerKey`, `google.key` → `googleKey`, `google.pub` → `googlePublicKey`. Los PEM se codifican con `Buffer.from(pem).toString("base64")`; no se versiona la clave privada de la CA.

El test de Apple extrae las entradas del ZIP, recalcula sus SHA-1 contra `manifest.json` y verifica firma y cadena con:

```sh
openssl cms -verify -inform DER -binary -in signature -content manifest.json -CAfile wwdr.crt -purpose any
```

# Certificado público Apple WWDR G4

El archivo real `src/shared/adapters/certs/AppleWWDRCAG4.crt` es público y contiene PEM; la extensión `.crt` evita el patrón global `*.pem` de gitignore. Descargado desde [Apple PKI](https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer) el 2026-09-07 y convertido desde DER:

```sh
curl -fsSL https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer | openssl x509 -inform DER -out src/shared/adapters/certs/AppleWWDRCAG4.crt
openssl x509 -in src/shared/adapters/certs/AppleWWDRCAG4.crt -noout -sha256 -fingerprint -subject -issuer -dates
```

- SHA-256: `EA:47:57:88:55:38:DD:8C:B5:9F:F4:55:6F:67:60:87:D8:3C:85:E7:09:02:C1:22:E4:2C:08:08:B5:BC:E1:4C`.
- Sujeto: `CN=Apple Worldwide Developer Relations Certification Authority, OU=G4, O=Apple Inc., C=US`.
- Emisor: Apple Root CA.
- Vigencia: 2020-12-16 19:36:04 UTC a 2030-12-10 00:00:00 UTC.

Apple identifica G4 como intermediario de los certificados Pass Type ID en su [documentación oficial](https://developer.apple.com/help/account/certificates/wwdr-intermediate-certificates/). El certificado de firma real y su clave privada se suministran únicamente por variables de entorno.
