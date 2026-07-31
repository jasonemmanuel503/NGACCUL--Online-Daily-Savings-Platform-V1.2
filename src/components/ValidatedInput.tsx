import React, { useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export function isValidName(val: string): boolean {
  if (!val || val.trim().length < 2) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]{2,}$/.test(val.trim());
}

export function isValidPhone(val: string): boolean {
  if (!val) return false;
  const cleaned = val.replace(/[\s\-\+]/g, '');
  // Cameroon numbers: 9 digits (starting with 6 or 2) or with 237 prefix (12 digits total)
  if (cleaned.startsWith('237') && cleaned.length === 12) {
    return /^\d{12}$/.test(cleaned);
  }
  return /^\d{9}$/.test(cleaned);
}

export function isValidCNI(val: string, docType?: string): boolean {
  if (!val) return false;
  const cleaned = val.trim();
  if (!/^\d+$/.test(cleaned)) return false; // Digits only!
  if (docType === 'receipt') {
    return cleaned.length >= 10 && cleaned.length <= 20;
  }
  // Standard CNI card is 17 digits
  return cleaned.length === 17;
}

export function getFieldStatus(
  value: string,
  validationType?: 'name' | 'phone' | 'cni' | 'email' | 'digits' | 'account_number' | 'pin' | 'custom',
  docType?: string,
  customValidate?: (val: string) => boolean,
  isTouched: boolean = false,
  isRequired: boolean = true
): 'neutral' | 'valid' | 'invalid' {
  if (!value || value.trim() === '') {
    return isTouched && isRequired ? 'invalid' : 'neutral';
  }

  let valid = false;
  switch (validationType) {
    case 'name':
      valid = isValidName(value);
      break;
    case 'phone':
      valid = isValidPhone(value);
      break;
    case 'cni':
      valid = isValidCNI(value, docType);
      break;
    case 'email':
      valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
      break;
    case 'account_number':
      valid = /^\d{4}$/.test(value.trim());
      break;
    case 'pin':
      valid = /^\d{6}$/.test(value.trim());
      break;
    case 'digits':
      valid = /^\d+$/.test(value.trim());
      break;
    case 'custom':
      valid = customValidate ? customValidate(value) : true;
      break;
    default:
      valid = value.trim().length > 0;
  }

  return valid ? 'valid' : 'invalid';
}

export function getValidationErrorMessage(
  validationType?: 'name' | 'phone' | 'cni' | 'email' | 'digits' | 'account_number' | 'pin' | 'custom',
  docType?: string,
  customMsg?: string
): string {
  if (customMsg) return customMsg;
  switch (validationType) {
    case 'name':
      return 'Name must contain letters only (minimum 2 characters)';
    case 'phone':
      return 'Enter a valid Cameroon phone number: 9 digits (e.g. 6XXXXXXXX) or +237 followed by 9 digits';
    case 'cni':
      return docType === 'receipt'
        ? 'CNI receipt number must be digits only (10-20 digits)'
        : 'National ID (CNI) must be exactly 17 digits';
    case 'email':
      return 'Enter a valid email address';
    case 'account_number':
      return 'Account number must be exactly 4 digits';
    case 'pin':
      return 'PIN must be exactly 6 digits';
    case 'digits':
      return 'Digits only';
    default:
      return 'Invalid input';
  }
}

interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label?: string;
  labelClassName?: string;
  validationType?: 'name' | 'phone' | 'cni' | 'email' | 'digits' | 'account_number' | 'pin' | 'custom';
  docType?: string;
  customValidate?: (val: string) => boolean;
  errorMessage?: string;
  showIcon?: boolean;
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  id,
  label,
  labelClassName,
  value = '',
  onChange,
  onBlur,
  validationType,
  docType,
  customValidate,
  errorMessage,
  showIcon = true,
  className = '',
  placeholder,
  ...props
}) => {
  const [touched, setTouched] = useState(false);
  const strVal = String(value || '');

  const isRequired = !!props.required;
  const status = getFieldStatus(strVal, validationType, docType, customValidate, touched, isRequired);
  const defaultError = getValidationErrorMessage(validationType, docType, errorMessage);

  let borderClass = 'border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary';
  if (status === 'valid') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500 focus:border-emerald-500 focus:ring-emerald-500';
  } else if (status === 'invalid') {
    borderClass = 'border-red-500 ring-1 ring-red-500 focus:border-red-500 focus:ring-red-500';
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched(true);
    if (onBlur) onBlur(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!touched) setTouched(true);
    if (onChange) onChange(e);
  };

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label htmlFor={id} className={`text-xs font-bold text-brand-primary/70 block ${labelClassName || ''}`}>
          {label}
        </label>
      )}
      <div className="relative w-full flex items-center">
        <input
          id={id}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full text-xs p-2.5 rounded-xl border bg-white text-brand-primary transition-all ${
            showIcon ? 'pr-9' : ''
          } ${borderClass} ${className}`}
          {...props}
        />
        {showIcon && status !== 'neutral' && (
          <div className="absolute right-2.5 pointer-events-none flex items-center justify-center">
            {status === 'valid' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
        )}
      </div>
      {status === 'invalid' && touched && (
        <p className="text-[10px] text-red-500 font-medium animate-fade-in">{defaultError}</p>
      )}
    </div>
  );
};
