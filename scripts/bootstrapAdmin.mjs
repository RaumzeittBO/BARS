// scripts/bootstrapAdmin.mjs
// Script oficial para registrar y verificar al primer administrador de BARS en bars-f911d

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAhFbnmoHw413ZM6Ddc7nZKvutswQ9h03o",
  authDomain: "bars-f911d.firebaseapp.com",
  projectId: "bars-f911d",
  storageBucket: "bars-f911d.firebasestorage.app",
  messagingSenderId: "417898442938",
  appId: "1:417898442938:web:ca93dcc98d36de6259d283"
};

const email = process.argv[2] || 'gfabrigtrf@gmail.com';
const password = process.argv[3];
const displayName = process.argv[4] || 'Administrador BARS';
const restaurantId = process.argv[5] || 'bars';

async function main() {
  console.log('==============================================');
  console.log('BARS — Configuración de Primer Administrador');
  console.log(`Proyecto Firebase: ${firebaseConfig.projectId}`);
  console.log(`Email objetivo:    ${email}`);
  console.log(`Restaurante ID:    ${restaurantId}`);
  console.log('==============================================\n');

  if (!password) {
    console.error('ERROR: Debes proporcionar la contraseña deseada.');
    console.log('\nUso:');
    console.log('  node scripts/bootstrapAdmin.mjs <email> <password> [displayName] [restaurantId]');
    console.log('\nEjemplo:');
    console.log('  node scripts/bootstrapAdmin.mjs gfabrigtrf@gmail.com MiPasswordSegura123 "Fabricio Admin" bars\n');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let userCredential;

  try {
    console.log(`Intentando crear nuevo usuario en Firebase Auth para ${email}...`);
    userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    console.log(`✓ Usuario creado exitosamente. UID: ${userCredential.user.uid}`);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log(`El usuario ${email} ya existe en Firebase Auth. Iniciando sesión para verificar credenciales...`);
      try {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        console.log(`✓ Sesión iniciada correctamente. UID: ${userCredential.user.uid}`);
      } catch (authErr) {
        console.error(`✗ Error de autenticación: ${authErr.message}`);
        process.exit(1);
      }
    } else {
      console.error(`✗ Error al crear usuario: ${error.message} (${error.code})`);
      process.exit(1);
    }
  }

  const uid = userCredential.user.uid;
  const memberRef = doc(db, 'restaurants', restaurantId, 'members', uid);

  console.log(`Registrando membresía de Administrador en Firestore: restaurants/${restaurantId}/members/${uid}...`);

  const memberData = {
    uid,
    email: email.trim(),
    displayName: displayName.trim(),
    role: 'admin',
    active: true,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(memberRef, memberData, { merge: true });
    console.log('✓ Documento de membresía guardado en Firestore exitosamente.');

    // Verificación de lectura
    const verifySnap = await getDoc(memberRef);
    if (verifySnap.exists()) {
      console.log('\n==============================================');
      console.log('¡ADMINISTRADOR CONFIGURADO Y CONFIRMADO!');
      console.log('Datos en Cloud Firestore:');
      console.log(JSON.stringify(verifySnap.data(), null, 2));
      console.log('==============================================\n');
    }
  } catch (err) {
    console.error(`✗ Error al guardar membresía en Firestore: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
