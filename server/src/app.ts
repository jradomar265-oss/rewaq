import cors from '@fastify/cors'
import Fastify from 'fastify'
import { env } from './env.js'
import { adminClient, authClient } from './supabase.js'
import { roles, type Profile, type UserRole } from './types.js'
import { authenticatedProfile, studentDashboard, updateStudentAssignment } from './student.js'

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && roles.includes(value as UserRole)
}

async function findProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await adminClient.from('profiles').select('id, full_name, role').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function buildApp() {
  const app = Fastify({ logger: true })
  await app.register(cors, { origin: env.corsOrigin })

  app.get('/health', async () => ({ status: 'ok' }))

  app.post<{ Body: { email?: string; password?: string; requestedRole?: UserRole } }>('/auth/sign-in', async (request, reply) => {
    const { email, password, requestedRole } = request.body
    if (!email || !password || !isRole(requestedRole)) return reply.code(400).send({ message: 'بيانات تسجيل الدخول غير مكتملة.' })
    const { data, error } = await authClient.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) return reply.code(401).send({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' })
    const profile = await findProfile(data.user.id)
    if (!profile) return reply.code(403).send({ message: 'لا يوجد ملف صلاحيات مرتبط بهذا الحساب.' })
    if (profile.role !== requestedRole) return reply.code(403).send({ message: 'هذا الحساب لا يملك صلاحية الدخول إلى البوابة المختارة.' })
    return { accessToken: data.session.access_token, profile }
  })

  app.get('/auth/me', async (request, reply) => {
    const profile = await authenticatedProfile(request)
    if (!profile) return reply.code(403).send({ message: 'لا يوجد ملف صلاحيات مرتبط بهذا الحساب.' })
    return { profile }
  })

  app.get('/student/dashboard', async (request, reply) => {
    const profile = await authenticatedProfile(request)
    if (!profile) return reply.code(401).send({ message: 'يلزم تسجيل الدخول.' })
    if (profile.role !== 'student') return reply.code(403).send({ message: 'هذه البيانات متاحة للطلاب فقط.' })
    return studentDashboard(profile.id)
  })

  app.patch<{ Params: { assignmentId: string }; Body: { status?: 'not_started' | 'in_progress' | 'submitted' } }>('/student/assignments/:assignmentId/status', async (request, reply) => {
    const profile = await authenticatedProfile(request)
    if (!profile) return reply.code(401).send({ message: 'يلزم تسجيل الدخول.' })
    if (profile.role !== 'student') return reply.code(403).send({ message: 'هذه العملية متاحة للطلاب فقط.' })
    const status = request.body.status
    if (!status || !['not_started', 'in_progress', 'submitted'].includes(status)) return reply.code(400).send({ message: 'حالة الواجب غير صالحة.' })
    const submission = await updateStudentAssignment(profile.id, request.params.assignmentId, status)
    if (!submission) return reply.code(404).send({ message: 'الواجب غير موجود ضمن مهامك.' })
    return { submission }
  })

  return app
}
