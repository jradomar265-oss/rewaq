// Creates the demo accounts (and demo learning data when the learning schema
// exists) so every portal can be tested end to end.
// Usage: npm run seed:demo
// Safe to re-run: existing accounts and rows are reused.
import { adminClient } from '../src/supabase.js'
import { roles, type UserRole } from '../src/types.js'

const demoPassword = 'RiwaqDemo!2026'

const demoAccounts: { email: string; fullName: string; role: UserRole }[] = [
  { email: 'student@riwaq.demo', fullName: 'أحمد الطالب', role: 'student' },
  { email: 'teacher@riwaq.demo', fullName: 'سارة المعلمة', role: 'teacher' },
  { email: 'parent@riwaq.demo', fullName: 'خالد ولي الأمر', role: 'parent' },
  { email: 'activities@riwaq.demo', fullName: 'نورة منسقة الأنشطة', role: 'activities' }
]

const learningTables = ['subjects', 'courses', 'enrollments', 'assignments', 'assignment_students', 'submissions', 'student_course_progress', 'notifications']

async function tableExists(table: string): Promise<boolean> {
  const { error } = await adminClient.from(table).select('*').limit(1)
  if (!error) return true
  if (error.code === 'PGRST205' || error.code === '42P01') return false
  throw error
}

async function ensureAccount(email: string, fullName: string, role: UserRole): Promise<string> {
  const { data: existing } = await adminClient.auth.admin.listUsers({ perPage: 200 })
  const found = existing?.users.find(user => user.email?.toLowerCase() === email)
  if (found) {
    await adminClient.auth.admin.updateUserById(found.id, { password: demoPassword, email_confirm: true, user_metadata: { full_name: fullName, role } })
    await adminClient.from('profiles').upsert({ id: found.id, full_name: fullName, role }, { onConflict: 'id' })
    console.log(`↺ ${email.padEnd(28)} موجود مسبقًا — تم تحديث الدور إلى ${role}`)
    return found.id
  }
  const { data, error } = await adminClient.auth.admin.createUser({ email, password: demoPassword, email_confirm: true, user_metadata: { full_name: fullName, role } })
  if (error || !data.user) throw error ?? new Error(`تعذر إنشاء الحساب ${email}`)
  console.log(`✓ ${email.padEnd(28)} أُنشئ بدور ${role}`)
  return data.user.id
}

async function singleId(table: string, match: Record<string, string>): Promise<string | null> {
  let query = adminClient.from(table).select('id')
  for (const [column, value] of Object.entries(match)) query = query.eq(column, value)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function seedLearning(ids: Record<UserRole, string>) {
  const subjectSeeds = [
    { name: 'الرياضيات', code: 'MATH101', color: '#2563eb' },
    { name: 'العلوم', code: 'SCI101', color: '#16a34a' },
    { name: 'اللغة العربية', code: 'ARB101', color: '#b45309' }
  ]
  for (const subject of subjectSeeds) {
    const existing = await singleId('subjects', { code: subject.code })
    if (existing) continue
    const { error } = await adminClient.from('subjects').insert(subject)
    if (error) throw error
  }
  const subjectIds = new Map<string, string>()
  for (const subject of subjectSeeds) {
    const id = await singleId('subjects', { code: subject.code })
    if (id) subjectIds.set(subject.code, id)
  }

  const courseSeeds = [
    { name: 'رياضيات الصف السابع', className: '٧/أ', code: 'MATH101' },
    { name: 'علوم الصف السابع', className: '٧/أ', code: 'SCI101' },
    { name: 'عربي الصف السابع', className: '٧/ب', code: 'ARB101' }
  ]
  const courseIds: string[] = []
  for (const course of courseSeeds) {
    let id = await singleId('courses', { name: course.name, teacher_id: ids.teacher })
    if (!id) {
      const subjectId = subjectIds.get(course.code)
      if (!subjectId) continue
      const { data, error } = await adminClient.from('courses').insert({ subject_id: subjectId, teacher_id: ids.teacher, name: course.name, class_name: course.className }).select('id').single()
      if (error) throw error
      id = data.id
    }
    courseIds.push(id)
  }

  for (const courseId of courseIds) {
    await adminClient.from('enrollments').upsert({ course_id: courseId, student_id: ids.student }, { onConflict: 'course_id,student_id' })
  }

  const progressSeeds = [
    { courseIndex: 0, average_score: 92, level: 'high' as const },
    { courseIndex: 1, average_score: 78, level: 'medium' as const },
    { courseIndex: 2, average_score: 54, level: 'weak' as const }
  ]
  for (const progress of progressSeeds) {
    const courseId = courseIds[progress.courseIndex]
    if (!courseId) continue
    await adminClient.from('student_course_progress').upsert({ student_id: ids.student, course_id: courseId, average_score: progress.average_score, level: progress.level }, { onConflict: 'student_id,course_id' })
  }

  const now = Date.now()
  const assignmentSeeds = [
    { courseIndex: 0, title: 'ورقة عمل: الكسور العشرية', description: 'حل التمارين من ١ إلى ١٢ في الكتاب.', difficulty: 'low' as const, dueAt: new Date(now + 3 * 86400000).toISOString(), status: 'not_started' as const, grade: null },
    { courseIndex: 1, title: 'تقرير: دورة الماء في الطبيعة', description: 'تقرير من صفحتين مع رسم توضيحي.', difficulty: 'medium' as const, dueAt: new Date(now + 1 * 86400000).toISOString(), status: 'in_progress' as const, grade: null },
    { courseIndex: 2, title: 'نشاط: إعراب الجمل الاسمية', description: 'أكمل التدريب ثم ارفع الصورة.', difficulty: 'high' as const, dueAt: new Date(now - 2 * 86400000).toISOString(), status: 'not_started' as const, grade: null },
    { courseIndex: 0, title: 'اختبار قصير: النسبة والتناسب', description: 'اختبار صفّي مدته ٢٠ دقيقة.', difficulty: 'medium' as const, dueAt: new Date(now - 6 * 86400000).toISOString(), status: 'completed' as const, grade: 88 }
  ]

  for (const seed of assignmentSeeds) {
    const courseId = courseIds[seed.courseIndex]
    if (!courseId) continue
    let assignmentId = await singleId('assignments', { title: seed.title, course_id: courseId })
    if (!assignmentId) {
      const { data, error } = await adminClient.from('assignments').insert({ course_id: courseId, teacher_id: ids.teacher, title: seed.title, description: seed.description, difficulty: seed.difficulty, due_at: seed.dueAt, state: 'published' }).select('id').single()
      if (error) throw error
      assignmentId = data.id
    }
    await adminClient.from('assignment_students').upsert({ assignment_id: assignmentId, student_id: ids.student }, { onConflict: 'assignment_id,student_id' })
    await adminClient.from('submissions').upsert({
      assignment_id: assignmentId,
      student_id: ids.student,
      status: seed.status,
      grade: seed.grade,
      submitted_at: seed.status === 'completed' ? seed.dueAt : null,
      teacher_feedback: seed.status === 'completed' ? 'أداء ممتاز، واصل التقدم.' : null
    }, { onConflict: 'assignment_id,student_id' })
  }

  const { count } = await adminClient.from('notifications').select('*', { count: 'exact' }).eq('student_id', ids.student)
  if (!count) {
    await adminClient.from('notifications').insert([
      { student_id: ids.student, title: 'واجب جديد في العلوم', body: 'تم نشر تقرير دورة الماء، آخر موعد غدًا.' },
      { student_id: ids.student, title: 'ملاحظة من المعلمة', body: 'تحتاج إلى تحسين مستوى العربية، راجع التدريبات.' }
    ])
  }
  console.log(`✓ بيانات تعليمية تجريبية: ${courseIds.length} مقرر، ${assignmentSeeds.length} واجب/نشاط`)
}

async function main() {
  console.log('حسابات تجريبية — كلمة المرور للجميع: ' + demoPassword + '\n')
  const ids = {} as Record<UserRole, string>
  for (const account of demoAccounts) ids[account.role] = await ensureAccount(account.email, account.fullName, account.role)

  const missing: string[] = []
  for (const table of learningTables) if (!(await tableExists(table))) missing.push(table)

  if (missing.length) {
    console.log(`\n⚠ جداول التعليم غير موجودة: ${missing.join(', ')}`)
    console.log('نفّذ supabase/migrations/20260929_student_learning.sql في Supabase SQL Editor ثم أعد تشغيل npm run seed:demo لإنشاء المواد والواجبات.')
  } else {
    console.log('')
    await seedLearning(ids)
  }

  const { data: profiles } = await adminClient.from('profiles').select('role')
  const counts: Record<string, number> = {}
  for (const profile of profiles ?? []) counts[profile.role] = (counts[profile.role] ?? 0) + 1
  console.log('\nالأدوار المتاحة: ' + roles.map(role => `${role}=${counts[role] ?? 0}`).join('  '))
}

await main()
