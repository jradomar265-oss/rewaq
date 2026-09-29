import type { StudentDashboardData, UserRole } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const tokenKey = 'riwaq-access-token'
const roleKey = 'riwaq-role'

interface ApiProfile { id: string; full_name: string | null; role: UserRole }
interface SignInResponse { accessToken: string; profile: ApiProfile }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init)
  const data = await response.json() as T & { message?: string }
  if (!response.ok) throw new Error(data.message ?? 'تعذر الاتصال بالخدمة.')
  return data
}

export const api = {
  currentRole: (): UserRole | null => sessionStorage.getItem(roleKey) as UserRole | null,
  signIn: async (email: string, password: string, requestedRole: UserRole) => {
    const data = await request<SignInResponse>('/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, requestedRole }) })
    sessionStorage.setItem(tokenKey, data.accessToken)
    sessionStorage.setItem(roleKey, data.profile.role)
    return data.profile
  },
  signOut: () => { sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(roleKey) }
  ,studentDashboard: () => request<StudentDashboardData>('/student/dashboard', { headers: { Authorization: `Bearer ${sessionStorage.getItem(tokenKey) ?? ''}` } })
  ,updateAssignmentStatus: (assignmentId: string, status: 'not_started' | 'in_progress' | 'submitted') => request(`/student/assignments/${assignmentId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey) ?? ''}` }, body: JSON.stringify({ status }) })
}
