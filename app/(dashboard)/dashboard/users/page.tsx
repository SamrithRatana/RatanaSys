// app/(dashboard)/dashboard/users/page.tsx
import Container from '@/components/Common/Container'
import TableWrapper from '@/components/Common/TableWrapper'
import UsersTable from './UsersTable'
import { getAllUsers } from '@/lib/data/getUserData'

export default async function AdminUsersPage() {
  try {
    const users = await getAllUsers()

    if (!users || users.length === 0) {
      return <Container>No users found.</Container>
    }

    return (
      <Container>
        <TableWrapper title='Admin Users'>
          <UsersTable users={users} />
        </TableWrapper>
      </Container>
    )
  } catch (error) {
    console.error("AdminUsersPage error:", error)
    return (
      <Container>
        <p className="text-red-500 text-center">
          Failed to load users. Please try again later.
        </p>
      </Container>
    )
  }
}