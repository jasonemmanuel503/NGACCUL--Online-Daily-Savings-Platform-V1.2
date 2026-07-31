import React, { useEffect } from "react";
import { CustomDateInput } from "./CustomDateInput";
import { Calendar } from "lucide-react";

export type PeriodType = "today" | "this_week" | "this_month" | "last_4_months" | "last_6_months" | "this_year" | "custom";

interface PeriodFilterProps {
  selectedPeriod: PeriodType;
  onChangePeriod: (period: PeriodType) => void;
  startDate: string; // YYYY-MM-DD
  onStartDateChange: (date: string) => void;
  endDate: string; // YYYY-MM-DD
  onEndDateChange: (date: string) => void;
  className?: string;
}

export function getPeriodDates(period: PeriodType): { startDate: string; endDate: string } {
  const today = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const r = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${r}`;
  };
  
  const end = new Date(today);
  const start = new Date(today);
  
  switch (period) {
    case "today":
      // Both start and end are today
      break;
    case "this_week": {
      // Start of week (Monday)
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      break;
    }
    case "this_month":
      start.setDate(1);
      break;
    case "last_4_months":
      start.setMonth(start.getMonth() - 4);
      start.setDate(1);
      break;
    case "last_6_months":
      start.setMonth(start.getMonth() - 6);
      start.setDate(1);
      break;
    case "this_year":
      start.setMonth(0);
      start.setDate(1);
      break;
    default:
      break;
  }
  
  return {
    startDate: formatYMD(start),
    endDate: formatYMD(end),
  };
}

export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  selectedPeriod,
  onChangePeriod,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  className = "",
}) => {
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const period = e.target.value as PeriodType;
    onChangePeriod(period);
    
    if (period !== "custom") {
      const { startDate: newStart, endDate: newEnd } = getPeriodDates(period);
      onStartDateChange(newStart);
      onEndDateChange(newEnd);
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-brand-surface/10 p-3.5 rounded-2xl border border-brand-secondary/10 ${className}`}>
      <div className="flex items-center gap-2 shrink-0">
        <Calendar className="w-4 h-4 text-brand-primary dark:text-white" />
        <span className="text-xs font-bold text-brand-primary dark:text-white">Period:</span>
      </div>
      
      <div className="relative flex-1 sm:max-w-[200px]">
        <select
          value={selectedPeriod}
          onChange={handlePeriodChange}
          className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary dark:text-white bg-white dark:bg-[#150b24] focus:outline-none focus:border-brand-primary font-bold cursor-pointer"
        >
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="last_4_months">Last 4 Months</option>
          <option value="last_6_months">Last 6 Months</option>
          <option value="this_year">This Year</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {selectedPeriod === "custom" && (
        <div className="flex flex-col sm:flex-row items-center gap-2 flex-1">
          <div className="w-full sm:w-auto flex-1">
            <CustomDateInput
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary dark:text-white bg-white dark:bg-[#150b24] focus:outline-none"
              placeholder="Start Date"
            />
          </div>
          <span className="text-xs text-brand-primary/50 dark:text-white/50 font-medium">to</span>
          <div className="w-full sm:w-auto flex-1">
            <CustomDateInput
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary dark:text-white bg-white dark:bg-[#150b24] focus:outline-none"
              placeholder="End Date"
            />
          </div>
        </div>
      )}
    </div>
  );
};
