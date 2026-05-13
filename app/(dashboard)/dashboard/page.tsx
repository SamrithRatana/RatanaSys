export const dynamic = 'force-dynamic'

import { Suspense } from "react"
import Container from "@/components/Common/Container"
import { MonthDateRangePicker } from "./MonthDateRangePicker"
import { Button } from "@/components/ui/button"
import StatsCards from "./StatsCards"

const Dashboard = () => {
  return (
    <Container>
      <div className="flex flex-col md:flex-row py-6 items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <MonthDateRangePicker />
          <Button>Download</Button>
        </div>
      </div>

      {/* ✅ Suspense prevents StatsCards crash from killing the whole page */}
      <Suspense fallback={
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      }>
        <StatsCards />
      </Suspense>
    </Container>
  )
}

export default Dashboard