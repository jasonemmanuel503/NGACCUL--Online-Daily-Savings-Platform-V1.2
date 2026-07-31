import React from 'react';

interface GlobalLoadingProps {
  isLoading: boolean;
  message?: string;
}

export const GlobalLoading: React.FC<GlobalLoadingProps> = ({ isLoading, message }) => {
  if (!isLoading) return null;
  return (
    <div id="global-loading-overlay" className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-[2px] z-[99999] flex flex-col items-center justify-center">
      <div className="bg-white dark:bg-[#1b112d] p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border border-brand-secondary/20 max-w-xs w-full mx-4">
        <div className="relative">
          {/* Inner pulsating ring */}
          <div className="w-12 h-12 rounded-full border-4 border-brand-secondary/20 animate-pulse" />
          {/* Outer fast spinning ring */}
          <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-4 border-brand-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-xs font-semibold text-brand-primary dark:text-violet-200 text-center leading-relaxed">
          {message || "Processing request..."}
        </p>
      </div>
    </div>
  );
};
