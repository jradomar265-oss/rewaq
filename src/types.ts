export type UserRole = 'student' | 'teacher' | 'parent' | 'activities'

export interface Portal {
  role: UserRole
  title: string
  shortRole: string
  icon: string
  accent: string
  description: string
  dashboardTitle: string
  avatar: string
  navigation: string[]
  permissionMessage: string
}

export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'late' | 'completed'
export type StudentLevel = 'weak' | 'medium' | 'high'

export interface StudentDashboardData {
  summary: { courses: number; assignments: number; late: number; level: StudentLevel }
  courses: { id: string; name: string; className: string | null; subject: string; color: string; score: number | null; level: StudentLevel }[]
  assignments: { id: string; title: string; description: string | null; difficulty: 'low' | 'medium' | 'high'; dueAt: string | null; status: AssignmentStatus; grade: number | null; subject: string; color: string }[]
  notifications: { id: string; title: string; body: string; is_read: boolean; created_at: string }[]
}
