import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import type { RestaurantMember, UserRole } from '../types'

interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

export interface FirebaseContext {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  restaurantId: string
}

function readFirebaseConfig(): FirebaseWebConfig | null {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  }

  const requiredValues = [
    config.apiKey,
    config.authDomain,
    config.projectId,
    config.storageBucket,
    config.messagingSenderId,
    config.appId,
  ]

  return requiredValues.every(Boolean) ? config : null
}

export function getFirebaseRestaurantId() {
  const restaurantId = import.meta.env.VITE_FIREBASE_RESTAURANT_ID
  return typeof restaurantId === 'string' && restaurantId.trim().length > 0 ? restaurantId.trim() : null
}

export function isFirebaseConfigured() {
  return Boolean(readFirebaseConfig() && getFirebaseRestaurantId())
}

let firebaseContextPromise: Promise<FirebaseContext | null> | null = null

export async function getFirebaseContext(): Promise<FirebaseContext | null> {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (!firebaseContextPromise) {
    firebaseContextPromise = (async () => {
      const firebaseConfig = readFirebaseConfig()
      const restaurantId = getFirebaseRestaurantId()

      if (!firebaseConfig || !restaurantId) {
        return null
      }

      const app = initializeApp(firebaseConfig)
      let db: Firestore

      const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

      try {
        db = initializeFirestore(app, {
          localCache: useEmulator
            ? memoryLocalCache()
            : persistentLocalCache({
                tabManager: persistentMultipleTabManager(),
              }),
        })
      } catch {
        db = initializeFirestore(app, {
          localCache: memoryLocalCache(),
        })
      }

      const auth = getAuth(app)

      if (useEmulator) {
        const host = window.location.hostname || 'localhost'
        connectFirestoreEmulator(db, host, 8080)
        connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
      }

      try {
        await setPersistence(auth, browserLocalPersistence)
      } catch {
        await setPersistence(auth, inMemoryPersistence)
      }

      return {
        app,
        auth,
        db,
        restaurantId,
      }
    })()
  }

  return firebaseContextPromise
}

export async function signInWithEmail(email: string, password: string) {
  const context = await getFirebaseContext()

  if (!context) {
    throw new Error('Firebase no esta configurado.')
  }

  return signInWithEmailAndPassword(context.auth, email, password)
}

export async function signOutUser() {
  const context = await getFirebaseContext()

  if (!context) {
    return
  }

  await firebaseSignOut(context.auth)
}

export async function getCurrentFirebaseUser() {
  const context = await getFirebaseContext()
  return context?.auth.currentUser ?? null
}

export async function subscribeToAuthChanges(listener: (user: User | null) => void): Promise<Unsubscribe> {
  const context = await getFirebaseContext()

  if (!context) {
    return () => undefined
  }

  return onAuthStateChanged(context.auth, listener)
}

export async function listRestaurantMembers() {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  const snap = await getDocs(collection(context.db, 'restaurants', context.restaurantId, 'members'))
  return snap.docs.map((memberDoc) => ({ uid: memberDoc.id, ...memberDoc.data() }) as RestaurantMember)
}

export async function createRestaurantMember(input: {
  email: string
  password: string
  displayName: string
  role: UserRole
}) {
  const context = await getFirebaseContext()
  const firebaseConfig = readFirebaseConfig()
  if (!context || !firebaseConfig) throw new Error('Firebase no esta configurado.')

  const secondaryApp = initializeApp(firebaseConfig, `member-create-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, input.email.trim(), input.password)
    await setDoc(doc(context.db, 'restaurants', context.restaurantId, 'members', credential.user.uid), {
      uid: credential.user.uid,
      email: input.email.trim(),
      displayName: input.displayName.trim() || input.email.trim(),
      role: input.role,
      active: true,
      createdAt: serverTimestamp(),
    })
  } finally {
    await firebaseSignOut(secondaryAuth).catch(() => undefined)
    await deleteApp(secondaryApp).catch(() => undefined)
  }
}

export async function updateRestaurantMember(uid: string, updates: Partial<Pick<RestaurantMember, 'role' | 'active' | 'displayName'>>) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  await updateDoc(doc(context.db, 'restaurants', context.restaurantId, 'members', uid), updates)
}

export async function sendRestaurantMemberPasswordReset(email: string) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  await sendPasswordResetEmail(context.auth, email.trim())
}

export async function deleteRestaurantMemberAccess(uid: string) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  await deleteDoc(doc(context.db, 'restaurants', context.restaurantId, 'members', uid))
}
