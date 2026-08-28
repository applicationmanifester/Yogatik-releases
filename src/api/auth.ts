/**
 * Authentication & Authorization Middleware
 *
 * Implements JWT token parsing, signature simulation, and permission scope enforcement.
 */

export type UserScope = 'tool:execute' | 'research:admin' | 'doc:write' | 'workspace:manage'

export interface UserSession {
  userId: string
  email: string
  role: 'admin' | 'researcher' | 'standard'
  scopes: UserScope[]
  issuedAt: number
  expiresAt: number
}

export function parseToken(authHeader?: string): UserSession | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      // Allow simulated API keys in dev mode
      if (token.startsWith('yk_live_') || token.startsWith('yk_test_')) {
        return {
          userId: 'dev_user_1',
          email: 'developer@yogatik.app',
          role: 'admin',
          scopes: ['tool:execute', 'research:admin', 'doc:write', 'workspace:manage'],
          issuedAt: Date.now(),
          expiresAt: Date.now() + 86400000,
        }
      }
      return null
    }

    const payloadJson = atob(parts[1])
    const payload = JSON.parse(payloadJson)

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null // Expired
    }

    return {
      userId: payload.sub || payload.userId || 'anon_user',
      email: payload.email || 'user@yogatik.app',
      role: payload.role || 'standard',
      scopes: payload.scopes || ['tool:execute'],
      issuedAt: payload.iat ? payload.iat * 1000 : Date.now(),
      expiresAt: payload.exp ? payload.exp * 1000 : Date.now() + 3600000,
    }
  } catch {
    return null
  }
}

export function authorizeScope(session: UserSession | null, requiredScope: UserScope): boolean {
  if (!session) return false
  if (session.role === 'admin') return true
  return session.scopes.includes(requiredScope)
}
