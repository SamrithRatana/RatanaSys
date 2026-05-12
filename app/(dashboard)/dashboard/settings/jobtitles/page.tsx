import DynamicTable from "@/components/Common/DynamicTable";

export default function JobTitlesPage() {
  return <DynamicTable title="Job Titles" apiPath="/api/jobtitles" />;
}