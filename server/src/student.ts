import type { FastifyRequest } from 'fastify'
import { adminClient, authClient } from './supabase.js'
import type { Profile } from './types.js'

type SubmissionStatus = 'not_started' | 'in_progress' | 'submitted' | 'late' | 'completed'

export async function authenticatedProfile(request: FastifyRequest): Promise<Profile | null> {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile, error: profileError } = await adminClient.from('profiles').select('id, full_name, role').eq('id', data.user.id).maybeSingle()
  if (profileError || !profile) return null
  return profile as Profile
}

function visibleStatus(status: SubmissionStatus | undefined, dueAt: string | null): SubmissionStatus {
  if (!status || status === 'not_started') return dueAt && new Date(dueAt) < new Date() ? 'late' : 'not_started'
  if (status === 'in_progress') return dueAt && new Date(dueAt) < new Date() ? 'late' : status
  return status
}

export async function studentDashboard(studentId: string) {
  const [{ data: enrollments, error: enrollmentError }, { data: assignmentLinks, error: linkError }, { data: notifications, error: notificationError }] = await Promise.all([
    adminClient.from('enrollments').select('course_id').eq('student_id', studentId),
    adminClient.from('assignment_students').select('assignment_id').eq('student_id', studentId),
    adminClient.from('notifications').select('id, title, body, is_read, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(5)
  ])
  if (enrollmentError || linkError || notificationError) throw enrollmentError ?? linkError ?? notificationError

  const courseIds = (enrollments ?? []).map(row => row.course_id)
  const assignmentIds = (assignmentLinks ?? []).map(row => row.assignment_id)
  const [{ data: courses, error: courseError }, { data: progress, error: progressError }, { data: assignments, error: assignmentError }, { data: submissions, error: submissionError }] = await Promise.all([
    courseIds.length ? adminClient.from('courses').select('id, name, class_name, subject:subjects(name, code, color)').in('id', courseIds) : Promise.resolve({ data: [], error: null }),
    courseIds.length ? adminClient.from('student_course_progress').select('course_id, average_score, level, updated_at').eq('student_id', studentId).in('course_id', courseIds) : Promise.resolve({ data: [], error: null }),
    assignmentIds.length ? adminClient.from('assignments').select('id, title, description, difficulty, due_at, course_id').eq('state', 'published').in('id', assignmentIds).order('due_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    assignmentIds.length ? adminClient.from('submissions').select('assignment_id, status, grade, submitted_at').eq('student_id', studentId).in('assignment_id', assignmentIds) : Promise.resolve({ data: [], error: null })
  ])
  if (courseError || progressError || assignmentError || submissionError) throw courseError ?? progressError ?? assignmentError ?? submissionError

  const progressByCourse = new Map((progress ?? []).map(item => [item.course_id, item]))
  const courseById = new Map((courses ?? []).map(item => [item.id, item]))
  const submissionByAssignment = new Map((submissions ?? []).map(item => [item.assignment_id, item]))
  const assignmentItems = (assignments ?? []).map(item => {
    const course = courseById.get(item.course_id) as { name: string; subject: { name: string; code: string; color: string } | null } | undefined
    const submission = submissionByAssignment.get(item.id)
    return { id: item.id, title: item.title, description: item.description, difficulty: item.difficulty, dueAt: item.due_at, status: visibleStatus(submission?.status as SubmissionStatus | undefined, item.due_at), grade: submission?.grade ?? null, subject: course?.subject?.name ?? course?.name ?? 'مادة دراسية', color: course?.subject?.color ?? '#087b77' }
  })
  const levels = (progress ?? []).map(item => item.level)
  const overallLevel = levels.includes('weak') ? 'weak' : levels.includes('medium') ? 'medium' : 'high'
  return {
    summary: { courses: courseIds.length, assignments: assignmentItems.length, late: assignmentItems.filter(item => item.status === 'late').length, level: overallLevel },
    courses: (courses ?? []).map(item => { const itemProgress = progressByCourse.get(item.id); const relatedSubject = Array.isArray(item.subject) ? item.subject[0] : item.subject; const subject = relatedSubject as { name: string; code: string; color: string } | null; return { id: item.id, name: item.name, className: item.class_name, subject: subject?.name ?? 'مادة دراسية', color: subject?.color ?? '#087b77', score: itemProgress?.average_score ?? null, level: itemProgress?.level ?? 'medium' } }),
    assignments: assignmentItems,
    notifications: notifications ?? []
  }
}

export async function updateStudentAssignment(studentId: string, assignmentId: string, status: 'not_started' | 'in_progress' | 'submitted') {
  const { data: link } = await adminClient.from('assignment_students').select('assignment_id').eq('student_id', studentId).eq('assignment_id', assignmentId).maybeSingle()
  if (!link) return null
  const values = { assignment_id: assignmentId, student_id: studentId, status, submitted_at: status === 'submitted' ? new Date().toISOString() : null }
  const { data, error } = await adminClient.from('submissions').upsert(values, { onConflict: 'assignment_id,student_id' }).select('status, submitted_at').single()
  if (error) throw error
  return data
}
