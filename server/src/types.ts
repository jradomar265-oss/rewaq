export const roles = ['student', 'teacher', 'parent', 'activities'] as const
export type UserRole = (typeof roles)[number]

export interface Profile {
  id: string
  full_name: string | null
  role: UserRole
}
