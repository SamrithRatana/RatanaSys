"use client";  // ← required for useState

import { useState } from "react";
import Container from "@/components/Common/Container";
import LeaveCard from "./LeaveCard";
import { Balances } from "@prisma/client";

type Props = {
  balances: Balances;
};

const UserBalances = ({ balances }: Props) => {
  const [isHours, setIsHours] = useState(true);

  return (
    <Container>
      {/* Title + Global Toggle */}
      <div className="flex items-center justify-between my-6">
        <h2 className="text-lg font-bold">Current Year Balances</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {isHours ? "Hours" : "Days"}
          </span>
          <button
            onClick={() => setIsHours(!isHours)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
              isHours ? "bg-blue-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                isHours ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 mb-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <LeaveCard year={balances?.year} leaveType={"ANNUAL"}    isHours={isHours} credit={balances?.annualCredit as number}    used={balances?.annualUsed as number}    balance={balances?.annualAvailable as number} />
        <LeaveCard year={balances?.year} leaveType={"SICK"}      isHours={isHours} credit={balances?.sickCredit as number}      used={balances?.sickUsed as number}      balance={balances?.sickAvailable as number} />
        <LeaveCard year={balances?.year} leaveType={"PERSONAL"}  isHours={isHours} credit={balances?.personalCredit as number}  used={balances?.personalUsed as number}  balance={balances?.personalAvailable as number} />
        <LeaveCard year={balances?.year} leaveType={"MATERNITY"} isHours={isHours} credit={balances?.maternityCredit as number} used={balances?.maternityUsed as number} balance={balances?.maternityAvailable as number} />
        <LeaveCard year={balances?.year} leaveType={"SPECIAL"}   isHours={isHours} credit={balances?.specialCredit as number}   used={balances?.specialUsed as number}   balance={balances?.specialAvailable as number} />
      <LeaveCard
  year={balances?.year}
  leaveType={"SHORT"}
  isHours={isHours}
  // credit and balance intentionally omitted — unlimited
  used={balances?.shortUsed as number}
/>
      </section>
    </Container>
  );
};

export default UserBalances;