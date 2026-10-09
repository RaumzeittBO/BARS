import { useSyncExternalStore } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { getFirebaseContext, getFirebaseRestaurantId, isFirebaseConfigured, signInWithEmail, signOutUser, subscribeToAuthChanges } from '../lib/firebase'
import { resetCatalogRepository } from './catalogRepositoryFactory'
import { resetOrdersRepository } from './repositoryFactory'
import type { RestaurantMember, UserRole } from '../types'

type AuthStatus = 'loading' | 'signed_out' | 'authorized' | 'unauthorized' | 'demo' | 'authenticating'

interface AuthState {
  mode: 'firebase' | 'local'
  status: AuthStatus
  userEmail: string | null
  userDisplayName: string | null
  role: UserRole | null
  member: RestaurantMember | null
  error: string | null
  restaurantId: string | null
}

const listeners = new Set<() => void>()
let initialized = false

let state: AuthState = !isFirebaseConfigured()
  ? {
      mode: 'local',
      status: 'demo',
      userEmail: 'demo@local',
      userDisplayName: 'Modo demo',
      role: 'admin',
      member: {
        uid: 'local-demo',
        email: 'demo@local',
        displayName: 'Modo demo',
        role: 'admin',
        active: true,
      },
      error: null,
      restaurantId: getFirebaseRestaurantId(),
    }
  : {
      mode: 'firebase',
      status: 'loading',
      userEmail: null,
      userDisplayName: null,
      role: null,
      member: null,
      error: null,
      restaurantId: getFirebaseRestaurantId(),
    }

function emit() {
  listeners.forEach((listener) => listener())
}

function resetDataRepositories() {
  resetOrdersRepository()
  resetCatalogRepository()
}

function setState(nextState: Partial<AuthState>) {
  state = {
    ...state,
    ...nextState,
  }
  emit()
}

async function fetchMember(userUid: string) {
  const context = await getFirebaseContext()

  if (!context) {
    throw new Error('Firebase no esta configurado correctamente.')
  }

  const memberRef = doc(context.db, 'restaurants', context.restaurantId, 'members', userUid)
  const memberSnapshot = await getDoc(memberRef)

  if (!memberSnapshot.exists()) {
    return null
  }

  const data = memberSnapshot.data()

  let createdAt: string | undefined
  if (data.createdAt) {
    if (typeof data.createdAt === 'string') {
      createdAt = data.createdAt
    } else if (typeof data.createdAt === 'object' && 'toDate' in data.createdAt && typeof (data.createdAt as { toDate: () => Date }).toDate === 'function') {
      createdAt = (data.createdAt as { toDate: () => Date }).toDate().toISOString()
    } else {
      createdAt = String(data.createdAt)
    }
  }

  const member: RestaurantMember = {
    uid: userUid,
    email: data.email ?? context.auth.currentUser?.email ?? '',
    displayName: data.displayName ?? context.auth.currentUser?.displayName ?? context.auth.currentUser?.email ?? 'Usuario',
    role: (data.role as UserRole) ?? 'caja',
    active: typeof data.active === 'boolean' ? data.active : false,
    createdAt,
  }

  return member
}

async function initialize() {
  if (initialized || !isFirebaseConfigured()) {
    return
  }

  initialized = true

  await subscribeToAuthChanges((user) => {
    resetDataRepositories()

    if (!user) {
      setState({
        status: 'signed_out',
        userEmail: null,
        userDisplayName: null,
        role: null,
        member: null,
        error: null,
      })
      return
    }

    setState({
      status: 'loading',
      userEmail: user.email ?? null,
      userDisplayName: user.displayName ?? user.email ?? 'Usuario',
      error: null,
    })

    void (async () => {
      try {
        const member = await fetchMember(user.uid)

        if (!member) {
          setState({
            status: 'unauthorized',
            role: null,
            member: null,
            error: 'No existe una membresia activa para este usuario en el restaurante.',
          })
          return
        }

        if (!member.active) {
          setState({
            status: 'unauthorized',
            role: member.role,
            member,
            error: 'Tu membresia existe pero no esta activa. Contacta a un administrador.',
          })
          return
        }

        setState({
          status: 'authorized',
          userEmail: member.email,
          userDisplayName: member.displayName,
          role: member.role,
          member,
          error: null,
        })
      } catch {
        setState({
          status: 'unauthorized',
          role: null,
          member: null,
          error: 'No fue posible validar la membresia del restaurante.',
        })
      }
    })()
  })
}

void initialize()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function getAuthMode() {
  return state.mode
}

export function useAuthStore() {
  const authState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    ...authState,
    async signIn(email: string, password: string) {
      setState({ error: null, status: 'authenticating' })

      if (import.meta.env.DEV && email.endsWith('@dev.local')) {
        const role = email.split('@')[0] as UserRole
        if (['admin', 'operador', 'caja', 'cocina', 'pedidos'].includes(role)) {
          setState({
            mode: 'local',
            status: 'authorized',
            userEmail: email,
            userDisplayName: `Test ${role.toUpperCase()}`,
            role: role,
            member: {
              uid: `mock-${role}`,
              email: email,
              displayName: `Test ${role.toUpperCase()}`,
              role: role,
              active: true,
            },
            error: null,
          })
          return
        }
      }

      try {
        await signInWithEmail(email, password)
      } catch (error) {
        setState({
          status: 'signed_out',
          error: error instanceof Error ? error.message : 'No se pudo iniciar sesion.',
        })
      }
    },
    async signOut() {
      if (authState.mode === 'local' && !authState.userEmail?.endsWith('@dev.local')) {
        return
      }

      await signOutUser()
      window.location.reload()
    },
    setRoleForDemo(role: UserRole) {
      if (import.meta.env.DEV && state.mode === 'local') {
        setState({
          role,
          userDisplayName: `Test ${role.toUpperCase()}`,
          member: state.member ? { ...state.member, role } : {
            uid: `mock-${role}`,
            email: `${role}@dev.local`,
            displayName: `Test ${role.toUpperCase()}`,
            role,
            active: true,
          }
        })
      }
    },
  }
}
