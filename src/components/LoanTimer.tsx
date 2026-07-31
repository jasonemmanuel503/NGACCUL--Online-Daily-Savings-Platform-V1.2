import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export const LoanTimer: React.FC<{ payBackBy?: string; termMonths?: number; createdAt?: string }> = ({ payBackBy, termMonths, createdAt }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    let targetStr = payBackBy;
    if (!targetStr && createdAt && termMonths) {
      const createdTime = new Date(createdAt).getTime();
      const offsetMs = termMonths * 30 * 24 * 60 * 60 * 1000;
      targetStr = new Date(createdTime + offsetMs).toISOString().slice(0, 10);
    }

    if (!targetStr) {
      setTimeLeft("No Date Logged");
      return;
    }
    
    const updateTimer = () => {
      const targetTime = new Date(targetStr!).getTime();
      const now = Date.now();
      const difference = targetTime - now;

      if (difference <= 0) {
        setTimeLeft("PAYMENT DUED / OVERDUE");
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft(`${days}d : ${hours}h : ${minutes}m : ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [payBackBy]);

  return (
    <div className="flex items-center gap-1.5 bg-violet-950/10 dark:bg-violet-950/30 px-3 py-1.5 rounded-xl border border-brand-secondary/20 text-[10px] font-black tracking-widest text-[#7C4DCC] uppercase">
      <Clock className="w-3.5 h-3.5 text-[#7C4DCC] animate-spin" style={{ animationDuration: '4s' }} />
      <span>Time Remaining: <span className="text-[#a855f7] select-all font-mono font-bold animate-pulse">{timeLeft}</span></span>
    </div>
  );
};
