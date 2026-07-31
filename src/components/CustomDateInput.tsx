import React, { useRef, useState } from "react";
import { Calendar } from "lucide-react";

interface CustomDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
}

export const CustomDateInput: React.FC<CustomDateInputProps> = ({
  className = "",
  wrapperClassName = "",
  onClick,
  onBlur,
  onChange,
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (isOpen) {
      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.blur();
      setIsOpen(false);
    } else {
      setIsOpen(true);
      // Let the browser trigger the native picker
    }
    if (onClick) {
      onClick(e);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Tiny delay to ensure state updates smoothly
    setTimeout(() => {
      setIsOpen(false);
    }, 150);
    if (onBlur) {
      onBlur(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsOpen(false);
    inputRef.current?.blur();
    if (onChange) {
      onChange(e);
    }
  };

  return (
    <div className={`relative w-full inline-flex items-center ${wrapperClassName}`}>
      <input
        ref={inputRef}
        type="date"
        className={`w-full cursor-pointer pr-10 ${className}`}
        onClick={handleClick}
        onBlur={handleBlur}
        onChange={handleChange}
        {...props}
      />
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-primary/60 dark:text-[#a384d6]/80 hover:text-[#b49be2] transition-colors flex items-center justify-center z-10"
        title="Open/Close calendar"
      >
        <Calendar className="w-4 h-4" />
      </div>
    </div>
  );
};
