// app/(dashboard)/dashboard/users/UsersTable.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Account, User } from "@prisma/client";
import AddCredits from "./AddCredits";
import DeleteUser from "./DeleteUser"; 
import EditUser, { UserWithAccounts } from "./EditUser";

type UserProps = {
  users: UserWithAccounts[];
};

const UsersTable = ({ users }: UserProps) => {
  return (
    <Table>
      <TableHeader className="whitespace-nowrap">
        <TableRow>
          <TableHead>Avatar</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Job Title</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Edit</TableHead>
          <TableHead>Add Leave Credits</TableHead>
          <TableHead>Delete</TableHead>

        </TableRow>
      </TableHeader>
      <TableBody className="whitespace-nowrap">
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">
              <Avatar>
                <AvatarImage src={user.image as string} alt={user.name as string} />
                <AvatarFallback>
                  {user.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TableCell>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.phone}</TableCell>
            <TableCell>
              <Badge variant="outline">{user.department}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{user.title}</Badge>
            </TableCell>
            <TableCell>{user.role}</TableCell>
            <TableCell className="text-right">
              <EditUser user={user} />
            </TableCell>
            <TableCell className="text-right">
              <AddCredits email={user.email as string} name={user.name as string} />
            </TableCell>
            <TableCell>
        <DeleteUser userId={user.id} userName={user.name ?? "User"} />
        </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default UsersTable;
