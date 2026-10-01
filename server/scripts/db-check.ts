// Read-only health check for the Supabase schema this platform depends on.
// Usage: npm run db:check
import { adminClient, authClient } from '../src/supabase.js'

const requiredTables = [
  'profiles',
  'subjects',
  'courses',
  'enrollments',
  'student_course_progress',
  'assignments',
  'assignment_students',
  'submissions',
  'notifications'
] as const

const requiredColumns: Record<string, string[]> = {
  courses: ['subject_id', 'teacher_id', 'name', 'class_name'],
  assignments: ['course_id', 'teacher_id', 'title', 'difficulty', 'due_at', 'state'],
  submissions: ['status', 'submitted_at', 'grade', 'teacher_feedback', 'private_note'],
  notifications: ['student_id', 'title', 'body', 'is_read']
}

async function main() {
  const failures: string[] = []

  for (const table of requiredTables) {
    // A GET request (not HEAD) is required: PostgREST only reports a missing
    // table through the response body, so a HEAD probe would look successful.
    const { error, count } = await adminClient.from(table).select('*', { count: 'exact' }).limit(1)
    if (error) {
      failures.push(`جدول ${table}: ${error.message}`)
      console.log(`✗ ${table.padEnd(24)} — مفقود أو غير قابل للوصول (${error.code ?? '?'})`)
    } else {
      console.log(`✓ ${table.padEnd(24)} — ${count ?? 0} سجل`)
    }
  }

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const { error } = await adminClient.from(table).select(columns.join(',')).limit(1)
    if (error) failures.push(`أعمدة ${table}: ${error.message}`)
  }

  const { data: users, error: userError } = await adminClient.auth.admin.listUsers({ perPage: 200 })
  if (userError) {
    failures.push(`auth.users: ${userError.message}`)
  } else {
    const list = users?.users ?? []
    console.log(`\nحسابات المصادقة: ${list.length}`)
    const roleCounts: Record<string, number> = {}
    for (const user of list) {
      const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
      const role = profile?.role ?? 'بدون ملف صلاحيات'
      roleCounts[role] = (roleCounts[role] ?? 0) + 1
      console.log(`  • ${user.email ?? user.id} — ${role}`)
    }
    console.log('\nتوزيع الأدوار:')
    for (const [role, total] of Object.entries(roleCounts)) console.log(`  ${role}: ${total}`)
  }

  const { error: anonError } = await authClient.auth.getSession()
  if (anonError) failures.push(`Supabase Auth: ${anonError.message}`)

  if (failures.length) {
    console.log('\nنتيجة الفحص: فشل')
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exitCode = 1
    return
  }
  console.log('\nنتيجة الفحص: المخطط مكتمل وقابل للوصول.')
}

await main()
