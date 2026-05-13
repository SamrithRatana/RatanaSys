export const dynamic = 'force-dynamic';

import DynamicTable from "@/components/Common/DynamicTable";

export default function RolesPage() {
  return <DynamicTable title="Roles" apiPath="/api/roles" />;
}