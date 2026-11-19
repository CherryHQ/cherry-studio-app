# Cloud application signing

The `signCloudRequest` public export signs canonical request text with the native Cloud client
credential and returns only the lowercase hexadecimal HMAC-SHA256 signature. The credential is
never returned to JavaScript. Its UTF-8 value is used directly, without the CherryAI suffix.

`plugins/withCloudSigning.js` reads `CHERRY_CLOUD_CLIENT_SECRET` during native generation, with
`MAIN_VITE_CHERRY_CLOUD_CLIENT_SECRET` as the Desktop-name fallback. It embeds the credential in
iOS application metadata and Android string resources, outside Expo's public `extra` configuration.
Android resource shrinking retains the dynamically resolved resource.

The Cloud inference boundary uses this signer only after validating the configured origin,
model, method and route. Product Session and device-signature authentication remain in place.
For signed-in inference, missing credentials or older native clients return `null` and retain device-only requests;
configured signing errors propagate instead of silently sending an unsigned application request.

Guest model discovery signs `GET /v1/models?limit=1000` with the raw query in the third canonical
field and a zero-byte body. Guest inference signs the final POST body. Both operations require
the application signature and send no Product Bearer or device signature.

Changing this credential or adding this module requires a new native build. An EAS environment
change or an OTA update alone cannot provision the credential in an installed client. Local EAS
builds must receive Secret-visibility values from their local build environment.
