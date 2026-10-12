# Publicar BARS para Android

El paquete oficial es `net.pachax.bars`. La firma de lanzamiento está fuera del repositorio, en la carpeta `BARS-firma-y-acceso` del escritorio del propietario. Se debe respaldar el archivo `bars-release.jks` y las contraseñas: perderlos impide instalar futuras versiones sobre la app existente.

## Compilar

1. Incrementar `versionCode` y `versionName` en `android/app/build.gradle` y la versión en `package.json`.
2. Ejecutar `npm run build:android` y `npx cap sync android`.
3. Definir `BARS_SIGNING_PROPERTIES` con la ruta absoluta al archivo privado `signing.properties`.
4. Ejecutar `android/gradlew.bat assembleRelease` desde `android/`.
5. Verificar `android/app/build/outputs/apk/release/app-release.apk` con `apksigner verify --print-certs`. La huella SHA-256 del certificado BARS es `6a9b9eb923e68be2edf7c13b6e5551c941a738d6f4379bf30056916126b6a611`.

## Publicar actualizaciones

El actualizador descarga exclusivamente de `bars-f911d.web.app` o `bars-f911d.firebaseapp.com`. Comprueba HTTPS, ruta, tamaño, SHA-256, paquete, versión creciente y certificado idéntico al instalado.

Para cada versión nueva, copiar el APK firmado a `public/updates/bars/apk/bars-VERSION.apk` y actualizar `public/updates/bars/update.json` con su URL, tamaño, SHA-256 y códigos de versión. Construir la web con `npm run build` y publicar con `firebase deploy --only hosting --project bars-f911d`.

El proyecto `bars-f911d` utiliza el plan Blaze. La versión 1.0.2 ofrece una actualización a las instalaciones oficiales 1.0.0 y 1.0.1. Android pedirá autorizar la instalación desde BARS la primera vez; tras conceder el permiso, vuelve a BARS y pulsa «Descargar e Instalar» de nuevo. Cada publicación posterior debe incrementar `versionCode`, usar la misma firma y actualizar el manifiesto después de generar el APK. `build:android` excluye el APK alojado de los assets móviles para evitar que una versión incluya la anterior dentro de sí misma.

Una compilación de depuración anterior tiene otro certificado y debe desinstalarse antes de instalar la primera versión oficial. El cambio de firma no se puede aplicar como actualización de Android.
