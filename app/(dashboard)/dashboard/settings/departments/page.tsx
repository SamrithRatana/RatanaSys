import DynamicTable from "@/components/Common/DynamicTable";

export default function DepartmentsPage() {
  return <DynamicTable title="Departments" apiPath="/api/departments" />;
}