import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  expectedLength?: number;
  isNumericOnly?: boolean;
  hasError?: boolean;
  showValidationBorder?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  className = '',
  value = '',
  expectedLength = 6,
  isNumericOnly = true,
  hasError = false,
  showValidationBorder = true,
  ...props
}) => {
  const [show, setShow] = useState(true);

  const strVal = String(value || '');
  let borderClass = '';

  if (showValidationBorder && strVal.length > 0) {
    const isNumeric = /^\d+$/.test(strVal);
    if (hasError || (isNumericOnly && !isNumeric) || strVal.length > expectedLength) {
      borderClass = '!border-2 !border-red-500 !ring-2 !ring-red-500/30 !bg-red-500/5 focus:!border-red-500 focus:!ring-red-500 text-red-700 dark:text-red-400';
    } else if (strVal.length === expectedLength && (isNumericOnly ? isNumeric : true)) {
      borderClass = '!border-2 !border-emerald-500 !ring-2 !ring-emerald-500/30 !bg-emerald-500/5 focus:!border-emerald-500 focus:!ring-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold';
    }
  }

  // Determine if text is centered to adjust padding if needed
  const isCentered = className.includes('text-center');
  const paddingClass = isCentered ? 'pr-10 pl-10' : 'pr-10';

  return (
    <div className="relative w-full">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        className={`${paddingClass} ${borderClass} transition-all ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
        className="z-10 text-brand-primary/50 hover:text-brand-primary/80 dark:text-white/40 dark:hover:text-white/70 cursor-pointer flex items-center justify-center p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-primary"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

