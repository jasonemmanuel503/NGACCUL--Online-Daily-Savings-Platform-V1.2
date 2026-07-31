import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, ChevronDown, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface GlassmorphismSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export const GlassmorphismSelect: React.FC<GlassmorphismSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = "-- Select option --",
  disabled = false,
  className = "",
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 150);
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const renderPortal = () => {
    if (typeof window === "undefined" || !document.body) return null;
    return createPortal(
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop with blur & smooth transition */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-[#070213]/55 dark:bg-black/80 backdrop-blur-lg"
            />

            {/* Modal Dialog container with premium glassmorphism card styling */}
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative w-full max-w-md bg-white/95 dark:bg-[#12072B]/95 backdrop-blur-2xl rounded-3xl border border-white/30 dark:border-brand-secondary/15 shadow-2xl p-6 flex flex-col max-h-[80vh] overflow-hidden z-[10000]"
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-brand-surface dark:border-brand-secondary/10 shrink-0">
                <div className="space-y-0.5 text-left">
                  <h4 className="text-sm font-display font-extrabold text-brand-primary dark:text-white">
                    {label || "Select Selection Option"}
                  </h4>
                  <p className="text-[10px] text-brand-primary/85 dark:text-brand-primary/90">
                    Real-time indexed search list
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg bg-brand-surface dark:bg-white/5 text-brand-primary/80 dark:text-white/85 hover:text-brand-accent dark:hover:text-brand-accent hover:bg-brand-surface/85 transition-all cursor-pointer focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic live filter search bar */}
              <div className="relative mb-4 shrink-0">
                <Search className="w-4 h-4 text-brand-primary/60 dark:text-brand-primary/70 absolute left-3.5 top-3" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type to search items dynamically..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs pl-10 pr-4 py-2.5 rounded-xl border border-brand-secondary/20 dark:border-brand-secondary/10 bg-brand-surface/40 dark:bg-black/20 text-brand-primary dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-accent font-numeric placeholder-brand-primary/30 dark:placeholder-brand-primary/45"
                />
              </div>

              {/* Options scrolling area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 py-1 space-y-1">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelect(opt.value)}
                        className={`w-full text-left text-xs px-4 py-3 rounded-xl flex items-center justify-between transition-all cursor-pointer text-brand-primary dark:text-white ${
                          isSelected
                            ? "bg-brand-primary text-white font-extrabold dark:bg-brand-accent"
                            : "hover:bg-brand-surface/60 dark:hover:bg-white/5"
                        }`}
                      >
                        <span className="truncate pr-4 leading-normal">{opt.label}</span>
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-brand-primary/75 dark:text-brand-primary/85 font-semibold italic">
                    No matching results found
                  </div>
                )}
              </div>

              {/* Footer counter helpful indicator bar */}
              <div className="mt-4 pt-2 border-t border-brand-surface dark:border-brand-secondary/10 flex justify-between items-center text-[10px] text-brand-primary/80 dark:text-brand-primary/95 font-numeric font-bold shrink-0">
                <span>Total item options: {options.length}</span>
                <span>Filtered: {filteredOptions.length}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );
  };

  return (
    <>
      {/* Trigger Button pretending to be a select */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={`w-full text-xs p-3 rounded-xl border border-brand-secondary/40 text-brand-primary bg-white dark:bg-[#1C1236]/90 focus:outline-none flex justify-between items-center cursor-pointer hover:border-brand-primary dark:hover:border-brand-accent transition-all text-center select-none ${
          disabled ? "opacity-50 cursor-not-allowed bg-brand-surface/10" : ""
        } ${className}`}
      >
        <span className="flex-1 text-center font-bold px-2 truncate leading-normal text-brand-primary dark:text-white/90">
          {displayText}
        </span>
        <ChevronDown className="w-4 h-4 text-brand-accent/70 shrink-0" />
      </button>

      {renderPortal()}
    </>
  );
};
