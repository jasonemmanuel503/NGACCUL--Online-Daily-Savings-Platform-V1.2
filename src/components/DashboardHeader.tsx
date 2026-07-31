import React, { useState, useEffect } from "react";
import { Clock, Calendar, Building2 } from "lucide-react";

interface DashboardHeaderProps {
  fullName?: string;
  timeZone?: string;
  language?: "en" | "fr" | "ff";
  strings?: Record<string, string>;
  subdivisionName?: string;
  subtitleKey?: string;
  staffRoleLabel?: string;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  fullName = "User",
  timeZone = "Africa/Douala",
  language = "en",
  strings,
  subdivisionName,
  subtitleKey,
  staffRoleLabel,
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const firstName = fullName
    ? fullName.trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase()
    : "USER";

  // Format date
  const formatDate = (date: Date) => {
    try {
      const locale = language === "fr" ? "fr-FR" : language === "ff" ? "fr-FR" : "en-US";
      return new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    } catch (e) {
      // Fallback
      return date.toLocaleDateString();
    }
  };

  // Format time
  const formatTime = (date: Date) => {
    try {
      const locale = language === "fr" ? "fr-FR" : language === "ff" ? "fr-FR" : "en-US";
      return new Intl.DateTimeFormat(locale, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    } catch (e) {
      // Fallback
      return date.toLocaleTimeString();
    }
  };

  return (
    <div
      id="dashboard-header-widget"
      className="relative overflow-hidden rounded-3xl p-6 shadow-xl hero-gradient-mesh bg-[#140924] text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300 hover:shadow-2xl gradient-border-glow"
    >
      {/* Subtle overlay grid/gradient */}
      <div className="absolute inset-0 bg-radial-gradient from-[#a384d6]/10 to-transparent pointer-events-none opacity-50" />

      {/* Greeting block */}
      <div className="space-y-1.5 relative z-10">
        {staffRoleLabel && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#a384d6]/20 border border-[#a384d6]/30 text-amber-300 rounded-full text-[10px] font-bold tracking-wider uppercase select-none shadow-sm mb-1">
            <span>{staffRoleLabel}</span>
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-sans font-bold tracking-tight text-white">
          {strings?.welcome_back || "Welcome back,"} <span className="text-[#a384d6]">{firstName}</span>
        </h1>
        {subdivisionName && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 border border-white/10 text-[#c8b8e8] rounded-full text-[11px] font-bold tracking-wide uppercase select-none shadow-sm">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span>{subdivisionName}</span>
          </div>
        )}
        <p className="text-xs text-white/60 font-medium">
          {subtitleKey && strings?.[subtitleKey]
            ? strings[subtitleKey]
            : strings?.executive_branch_console || "Executive Branch Console & Financial Real-time Metrics"}
        </p>
      </div>

      {/* Clock / Weather style minimal widget */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 relative z-10 self-stretch md:self-auto justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#a384d6]" />
          <span className="text-xs font-medium text-white/95 select-none tracking-wide">
            {formatDate(time)}
          </span>
        </div>
        <div className="hidden sm:block w-px h-6 bg-white/10" />
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: "12s" }} />
          <span className="text-sm font-mono font-bold text-amber-300 tracking-wider">
            {formatTime(time)}
          </span>
        </div>
      </div>
    </div>
  );
};
