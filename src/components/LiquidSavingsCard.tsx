import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, ShieldCheck, History, ArrowUpRight, Info } from "lucide-react";

interface LiquidSavingsCardProps {
  balance: number;
  pendingWithdrawals?: number;
  joinedAt: string;
  displayId: string;
  strings: any;
}

export function LiquidSavingsCard({
  balance,
  pendingWithdrawals = 0,
  joinedAt,
  displayId,
  strings,
}: LiquidSavingsCardProps) {
  // Determine fill percentage based on a standard local milestone (e.g. 500,000 FCFA)
  const MILESTONE = 500000;
  const availableBalance = Math.max(0, balance - pendingWithdrawals);
  const targetFill = Math.min(95, Math.max(22, (availableBalance / MILESTONE) * 100));

  const [animatedFill, setAnimatedFill] = useState(0);

  useEffect(() => {
    // Elegant staggered entry animation
    const timer = setTimeout(() => {
      setAnimatedFill(targetFill);
    }, 400);
    return () => clearTimeout(timer);
  }, [targetFill]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-brand-secondary/35 p-6 shadow-xl space-y-6 hero-gradient-mesh group transition-all duration-300 hover:shadow-2xl hover:border-brand-accent/40">
      {/* Outer Glow Highlight Grid */}
      <div className="absolute inset-0 bg-radial-gradient from-brand-accent/10 to-transparent pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-50" />

      <div className="flex justify-between items-start relative z-10">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wider uppercase text-violet-700 dark:text-violet-200">
            {strings.my_balance}
          </p>
          <div className="flex items-center gap-1.5 py-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
            <div className="relative group/tooltip inline-block">
              <Info className="w-4 h-4 text-emerald-400/80 hover:text-emerald-400 cursor-help transition-colors" />
              {/* Tooltip Popup */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 translate-y-1 group-hover/tooltip:translate-y-0 z-50 w-40 sm:w-48 text-center">
                <div className="bg-slate-900 border border-slate-700 text-white text-[9px] font-mono uppercase tracking-wider px-2.5 py-1.5 rounded-lg shadow-xl whitespace-normal break-words leading-tight">
                  Real-time Active Savings
                </div>
                {/* Arrow */}
                <div className="w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-700 rotate-45 mx-auto -mt-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Elegant Glass Shield Badge */}
        <div className="flex items-center gap-1 bg-white/10 dark:bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-[10px] uppercase tracking-wider font-bold text-brand-secondary dark:text-brand-accent">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Secured Account
        </div>
      </div>

      {/* THE LIQUID JAR WINDOW CONTAINER */}
      <div className="relative h-44 rounded-2xl bg-black/5 dark:bg-black/35 border border-brand-secondary/20 overflow-hidden shadow-inner flex flex-col justify-end p-5">
        {/* Animated fluid layers filling the container */}
        <div
          className="wave-container"
          style={{ height: `${animatedFill}%` }}
        >
          {/* Parallax deep background wave */}
          <div className="wave-layer wave-layer-bg" />
          {/* Foreground active wave */}
          <div className="wave-layer wave-layer-fg" />
          {/* Foam shimmer particles bubble highlights */}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-[#E8B649]/15 to-transparent animate-pulse" />
        </div>

        {/* Dynamic Watermark Indicator */}
        <div className="absolute bottom-3 right-4 opacity-15 pointer-events-none select-none">
          <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>

        {/* Dynamic Gold Sparkle on Harvest Prosperity Threshold */}
        {balance > 250000 && (
          <div className="absolute top-4 right-4 text-[#E8B649]/90 animate-bounce">
            <Sparkles className="w-5 h-5 drop-shadow-[0_2px_8px_rgba(232,182,73,0.5)]" />
          </div>
        )}

        {/* Foreground Glass card contents (Amount digits override) */}
        <div className="relative z-10 space-y-1 w-full text-left">
          <span className="text-[9px] uppercase tracking-widest text-[#E8B649] font-mono block">
            AVAILABLE SAVINGS BALANCE
          </span>
          <h3 className="text-3xl font-display font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] font-numeric flex items-baseline gap-2">
            {availableBalance.toLocaleString()}
            <span className="text-xs font-bold tracking-normal opacity-90 text-[#C8B8E8] font-sans">
              FCFA
            </span>
          </h3>
          {pendingWithdrawals > 0 && (
            <div className="text-[10px] text-pink-300 font-extrabold flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded-md w-fit">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              Pending Withdrawals: -{pendingWithdrawals.toLocaleString()} FCFA
            </div>
          )}
          <div className="text-[10px] text-white/95 flex justify-between items-center bg-black/25 px-2.5 py-1 rounded-xl mt-1.5 border border-white/5">
            <span className="font-semibold text-violet-200">Total Account Balance:</span>
            <span className="font-mono font-black">{balance.toLocaleString()} FCFA</span>
          </div>
          <span className="text-[10px] text-white/70 block backdrop-blur-xs font-semibold py-0.5 pt-1">
            Fill level is {Math.round(targetFill)}% of Savings Goal ({MILESTONE.toLocaleString()} FCFA)
          </span>
        </div>
      </div>

      {/* METADATA LOWER BAR */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-secondary/15 relative z-10">
        <div>
          <span className="text-[9px] text-violet-700 dark:text-violet-200 uppercase tracking-widest block font-bold">
            Joined Member
          </span>
          <span className="text-xs font-bold text-white dark:text-brand-primary drop-shadow-sm flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
            {new Date(joinedAt).toLocaleDateString()}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-violet-700 dark:text-violet-200 uppercase tracking-widest block font-bold">
            Display ID
          </span>
          <span className="text-xs font-mono font-bold text-[#E8B649] select-all flex items-center gap-1 mt-0.5">
            {displayId}
          </span>
        </div>
      </div>
    </div>
  );
}
