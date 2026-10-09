# Firebase Setup For Comandero

Comandero usa Firebase Authentication + Firestore para produccion. Si Firebase no esta configurado, la app entra en `Modo local/demo` usando `localStorage`. Ese modo sirve para desarrollo o demostracion, pero no aplica seguridad real.

## 1. Crear el proyecto Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com/).
2. Crea un proyecto nuevo o reutiliza uno existente.
3. Crea una app Web dentro del proyecto.
4. Copia la configuracion del SDK para llenar el archivo `.env`.

## 2. Crear Firestore

1. Ve a **Firestore Database**.
2. Haz clic en **Create database**.
3. Usa **Production mode**.
4. Elige la region mas cercana a tu operacion.

## 3. Activar Email/Password Authentication

1. Ve a **Authentication**.
2. Abre la pestana **Sign-in method**.
3. Activa **Email/Password**.
4. No habilites registro publico desde la app. Los usuarios iniciales se crean manualmente desde Firebase Console.

## 4. Configurar `.env`

Crea un archivo `.env` basado en [`.env.example`](C:/dev/comandero/.env.example) y completa:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_RESTAURANT_ID=
```

`VITE_FIREBASE_RESTAURANT_ID` identifica el restaurante. Para este despliegue usa `principal`.

## 5. Crear los usuarios iniciales manualmente

Debes crear al menos estos usuarios en **Authentication > Users**:

1. `admin`
2. `caja`
3. `cocina`

Para cada uno:

1. Entra a **Authentication > Users**.
2. Haz clic en **Add user**.
3. Escribe correo y contrasena.
4. Guarda.

## 6. Obtener el UID de cada usuario

Hay dos formas simples:

### Opcion A: desde Authentication

1. Abre el usuario creado.
2. Copia el campo `User UID`.

### Opcion B: con Firebase Console en Firestore

1. Intenta iniciar sesion con el usuario.
2. Revisa la pestaña del usuario en Authentication y copia el UID.

## 7. Crear manualmente la membresia del restaurante

Cada usuario necesita un documento en:

`restaurants/{restaurantId}/members/{uid}`

Ejemplo para el admin:

Coleccion:

`restaurants/principal/members`

Documento:

`UID_DEL_ADMIN`

Campos:

```json
{
  "email": "admin@midominio.com",
  "displayName": "Administrador Principal",
  "role": "admin",
  "active": true,
  "createdAt": "2026-06-19T00:00:00.000Z"
}
```

Repite lo mismo para caja y cocina usando `role: "caja"` y `role: "cocina"`.

Roles validos:

- `admin`
- `caja`
- `cocina`

Importante:

- La app no crea membresias.
- La app no cambia roles.
- Si el usuario existe en Authentication pero no tiene este documento o `active: false`, vera `Acceso no autorizado`.

## 8. Estructura de colecciones usada por la app

### Membresias

`restaurants/{restaurantId}/members/{uid}`

### Catalogo

`restaurants/{restaurantId}/catalog/current/categories/{categoryId}`

`restaurants/{restaurantId}/catalog/current/products/{productId}`

### Pedidos del dia

`restaurants/{restaurantId}/days/{YYYY-MM-DD}`

`restaurants/{restaurantId}/days/{YYYY-MM-DD}/orders/{orderId}`

## 9. Publicar reglas Firestore

Usa las reglas de [firebase/firestore.rules](C:/dev/comandero/firebase/firestore.rules).

### Opcion A: Firebase Console

1. Ve a **Firestore Database**.
2. Abre la pestana **Rules**.
3. Reemplaza el contenido con `firebase/firestore.rules`.
4. Haz clic en **Publish**.

### Opcion B: Firebase CLI

```bash
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

## 10. Como probar cada rol

Usa navegadores distintos o perfiles separados para evitar que compartan sesion.

### Admin

Debe poder:

- Entrar a Caja
- Entrar a Cocina
- Entrar a Historial
- Entrar a Administracion
- Crear y editar catalogo
- Marcar `Listo -> Entregado`

### Caja

Debe poder:

- Entrar a Caja
- Entrar a Historial
- Crear pedidos
- Registrar pagos
- Marcar `Listo -> Entregado`

No debe poder:

- Ver Administracion
- Ver Cocina
- Editar catalogo

### Cocina

Debe poder:

- Entrar a Cocina
- Mover `Pendiente -> En preparacion -> Listo`

No debe poder:

- Ver Administracion
- Ver Historial
- Crear pedidos
- Alterar pagos o importes
- Marcar `Entregado`

### Usuario sin membresia

Debe:

- Poder autenticarse en Firebase
- Ver pantalla de `Acceso no autorizado`
- No poder leer catalogo ni pedidos

## 11. Como probar con varios dispositivos

1. Ejecuta:

```bash
npm install
npm run dev
```

2. Abre la app en tres perfiles o dispositivos:
   - uno con usuario admin
   - uno con usuario caja
   - uno con usuario cocina
3. Verifica que cada uno solo vea sus modulos permitidos.
4. Desde Caja crea pedidos.
5. Desde Cocina cambia estados hasta `Listo`.
6. Desde Caja o Admin marca `Entregado`.
7. Confirma sincronizacion en tiempo real.

## 12. Que ocurre en modo local/demo

Si faltan variables Firebase, la app entra en `Modo local/demo`:

- No usa login real
- No aplica reglas Firestore
- Usa `localStorage`
- Muestra advertencia visible de que no es modo produccion

Ese modo sirve para desarrollo y demos, no para operar en produccion.
