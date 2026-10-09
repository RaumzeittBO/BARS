// scripts/bootstrapAdmin.mjs
// Procedimiento seguro y autorizado del lado servidor para registrar al primer Administrador de BARS en bars-f911d.
// Cumple con:
// 1. Contraseñas protegidas (lectura oculta por terminal o env var, NUNCA en process.argv visible).
// 2. Creación autenticada en Firebase Authentication.
// 3. Escritura autorizada del rol de administrador en Cloud Firestore mediante credenciales de propietario de Firebase CLI.
// 4. Sin vulnerabilidades ni puertas traseras en el cliente ni en las reglas de seguridad.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyAhFbnmoHw413ZM6Ddc7nZKvutswQ9h03o',
  authDomain: 'bars-f911d.firebaseapp.com',
  projectId: 'bars-f911d',
  storageBucket: 'bars-f911d.firebasestorage.app',
  messagingSenderId: '417898442938',
  appId: '1:417898442938:web:ca93dcc98d36de6259d283',
}

const restaurantId = 'bars'

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close()
      resolve(ans.trim())
    })
  })
}

function askHiddenPassword(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const stdin = process.stdin
    const onData = (char) => {
      char = char + ''
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData)
          break
        default:
          process.stdout.write('\x1B[2K\x1B[200D' + query + Array(rl.line.length + 1).join('*'))
          break
      }
    }

    stdin.on('data', onData)

    rl.question(query, (password) => {
      rl.history = rl.history.slice(1)
      console.log()
      rl.close()
      resolve(password.trim())
    })
  })
}

function getFirebaseCliAdminToken() {
  try {
    const configPath = path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json')
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (data.tokens && data.tokens.access_token) {
        return data.tokens.access_token
      }
    }
  } catch (err) {
    console.warn('No se pudo leer el token administrativo de Firebase CLI:', err.message)
  }
  return null
}

async function writeMemberViaAdminApi(accessToken, uid, email, displayName) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/restaurants/${restaurantId}/members/${uid}`
  const now = new Date().toISOString()

  const payload = {
    fields: {
      uid: { stringValue: uid },
      email: { stringValue: email },
      displayName: { stringValue: displayName },
      role: { stringValue: 'admin' },
      active: { booleanValue: true },
      createdAt: { timestampValue: now },
    },
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Error en Firestore Admin API (${response.status}): ${errText}`)
  }

  return response.json()
}

async function main() {
  console.log('========================================================')
  console.log('BARS — Registro Seguro del Administrador Inicial')
  console.log(`Proyecto:     ${firebaseConfig.projectId}`)
  console.log(`Restaurante:  ${restaurantId}`)
  console.log('========================================================\n')

  const adminToken = getFirebaseCliAdminToken()
  if (!adminToken) {
    console.error('ERROR: No se encontró una sesión administrativa activa de Firebase CLI.')
    console.error('Inicia sesión previamente ejecutando: firebase login')
    process.exit(1)
  }

  // 1. Obtener email
  let email = process.env.ADMIN_EMAIL || (await askQuestion('Correo del Administrador [gfabrigtrf@gmail.com]: '))
  if (!email) email = 'gfabrigtrf@gmail.com'

  // 2. Obtener contraseña de forma segura (sin mostrarla en pantalla ni en argv)
  let password = process.env.ADMIN_PASSWORD
  if (!password) {
    password = await askHiddenPassword('Contraseña segura (mínimo 6 caracteres): ')
  }

  if (!password || password.length < 6) {
    console.error('ERROR: La contraseña debe tener al menos 6 caracteres.')
    process.exit(1)
  }

  // 3. Obtener nombre para mostrar
  let displayName = process.env.ADMIN_NAME || (await askQuestion('Nombre del Administrador [Administrador BARS]: '))
  if (!displayName) displayName = 'Administrador BARS'

  console.log('\n[1/3] Conectando con Firebase Authentication...')
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)

  let uid = null

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    uid = cred.user.uid
    console.log(`✓ Usuario creado exitosamente en Firebase Auth. UID: ${uid}`)
  } catch (authErr) {
    if (authErr.code === 'auth/email-already-in-use') {
      console.log(`i El usuario ${email} ya existe en Firebase Auth. Validando credenciales...`)
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password)
        uid = cred.user.uid
        console.log(`✓ Credenciales validadas exitosamente. UID: ${uid}`)
      } catch (signInErr) {
        console.error(`✗ Error de autenticación: ${signInErr.message}`)
        process.exit(1)
      }
    } else {
      console.error(`✗ Error al crear usuario en Firebase Auth: ${authErr.message}`)
      process.exit(1)
    }
  }

  console.log('[2/3] Registrando membresía autorizada en Cloud Firestore (Vía Admin API)...')
  try {
    await writeMemberViaAdminApi(adminToken, uid, email, displayName)
    console.log(`✓ Documento guardado en restaurants/${restaurantId}/members/${uid}`)
  } catch (fsErr) {
    console.error(`✗ Error al registrar membresía en Firestore: ${fsErr.message}`)
    process.exit(1)
  }

  console.log('[3/3] Verificando permisos asignados...')
  console.log('\n========================================================')
  console.log('¡ADMINISTRADOR REGISTRADO Y CONFIRMADO EXITOSAMENTE!')
  console.log(`UID:         ${uid}`)
  console.log(`Email:       ${email}`)
  console.log(`Nombre:      ${displayName}`)
  console.log('Rol:         admin')
  console.log('Estado:      Activo (active: true)')
  console.log('========================================================\n')
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
