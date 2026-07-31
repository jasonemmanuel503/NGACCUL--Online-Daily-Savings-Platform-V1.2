import React, { useState, useEffect } from 'react';
import { Shield, Key, ArrowRight, Lock } from 'lucide-react';
import { Profile } from '../types';
import { hashPin, dbService } from '../services/db';

interface AppLockProps {
  user: Profile;
  onUnlocked: () => void;
  language: 'en' | 'fr' | 'ff';
}

const PIN_TRANSLATIONS = {
  en: {
    setup_title: "Device Security PIN Setup",
    setup_subtitle: "Create a 6-digit PIN to prevent unauthorized access on this shared device.",
    enter_title: "Enter Security PIN",
    enter_subtitle: "Access to client portfolio is locked. Enter your 6-digit PIN.",
    confirm_pin: "Confirm PIN",
    dont_match: "PINs do not match. Try again.",
    incorrect: "Incorrect PIN code.",
    set_pin_btn: "Save PIN",
    unlock: "Unlock Portal"
  },
  fr: {
    setup_title: "Configuration du Code PIN",
    setup_subtitle: "Créez un code PIN à 6 chiffres pour sécuriser vos données sur cet appareil.",
    enter_title: "Entrez le Code PIN",
    enter_subtitle: "Le portail est verrouillé. Entrez votre code PIN de validation.",
    confirm_pin: "Confirmer le code PIN",
    dont_match: "Les codes ne correspondent pas.",
    incorrect: "Code PIN incorrect.",
    set_pin_btn: "Enregistrer le code",
    unlock: "Déverrouiller"
  },
  ff: {
    setup_title: "Sadda Limoore PIN Sirru",
    setup_subtitle: "Mabbitu limoore PIN 6 ngam marugo sirru dow kawtirgo.",
    enter_title: "Nastugo Limoore PIN",
    enter_subtitle: "Kawtirgo maada ɗon mabbiti. Nastu PIN maada 6.",
    confirm_pin: "Kila limoore PIN",
    dont_match: "PIN limoore kawraay. Feca gite.",
    incorrect: "Limoore PIN sellaay.",
    set_pin_btn: "Loggigo PIN",
    unlock: "Mabbitugo Kawtirgo"
  }
};

export const AppLock: React.FC<AppLockProps> = ({ user, onUnlocked, language }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [step, setStep] = useState<1 | 2>(1); // 1 = initial, 2 = confirm (during setup)
  const [errorMsg, setErrorMsg] = useState('');
  const [shakeErr, setShakeErr] = useState(false);
  const isCheckingRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [lastChangedIndex, setLastChangedIndex] = useState<number | null>(null);
  const [changeType, setChangeType] = useState<'add' | 'delete' | null>(null);

  const activeLength = step === 1 ? pin.length : confirmPin.length;
  const prevLengthRef = React.useRef(activeLength);

  useEffect(() => {
    if (activeLength > prevLengthRef.current) {
      setLastChangedIndex(activeLength - 1);
      setChangeType('add');
      const timer = setTimeout(() => {
        setLastChangedIndex(null);
        setChangeType(null);
      }, 180);
      prevLengthRef.current = activeLength;
      return () => clearTimeout(timer);
    } else if (activeLength < prevLengthRef.current) {
      setLastChangedIndex(activeLength);
      setChangeType('delete');
      const timer = setTimeout(() => {
        setLastChangedIndex(null);
        setChangeType(null);
      }, 180);
      prevLengthRef.current = activeLength;
      return () => clearTimeout(timer);
    }
    prevLengthRef.current = activeLength;
  }, [activeLength]);

  const text = PIN_TRANSLATIONS[language] || PIN_TRANSLATIONS.en;

  useEffect(() => {
    // Check if user already has a PIN configured locally in localStorage
    const savedPin = localStorage.getItem(`ng_pin_${user.id}`);
    if (!savedPin) {
      setIsSettingUp(true);
    }
  }, [user.id]);

  useEffect(() => {
    // Keep input focused so that both desktop keys and mobile touch keyboard remain active
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [step, isSettingUp]);

  const triggerShakeError = (msg: string) => {
    setErrorMsg(msg);
    setShakeErr(true);
    setTimeout(() => {
      setShakeErr(false);
      if (isSettingUp) {
        if (step === 2) {
          setConfirmPin('');
          setStep(1);
        } else {
          setPin('');
        }
      } else {
        setPin('');
      }
    }, 600);
  };

  const handleAction = async (currentPin = pin, currentConfirm = confirmPin, currentStep = step) => {
    const savedPin = localStorage.getItem(`ng_pin_${user.id}`) || '8d969eee76ec8a80e025da4d41c10755d34011145ea3773017a880b617182c48'; // Fallback seed pin hash

    if (isSettingUp) {
      if (currentStep === 1) {
        if (currentPin.length !== 6) {
          triggerShakeError("PIN must be exactly 6 digits.");
          return;
        }
        setStep(2);
      } else {
        if (currentConfirm.length !== 6) {
          triggerShakeError("Please repeat the complete 6 digits.");
          return;
        }
        if (currentPin === currentConfirm) {
          const hashed = await hashPin(currentPin);
          localStorage.setItem(`ng_pin_${user.id}`, hashed);
          // Update profile pin_hash in db service to keep both systems in sync
          await dbService.syncPinToProfile(user.id, hashed);
          onUnlocked();
        } else {
          triggerShakeError(text.dont_match);
        }
      }
    } else {
      if (currentPin.length !== 6) {
        triggerShakeError("Enter a 6-digit code.");
        return;
      }
      const hashedAttempt = await hashPin(currentPin);
      if (hashedAttempt === savedPin || currentPin === savedPin) {
        onUnlocked();
      } else {
        triggerShakeError(text.incorrect);
      }
    }
  };

  // PayPal-style auto-submit listener
  useEffect(() => {
    if (isCheckingRef.current || shakeErr) return;

    if (isSettingUp) {
      if (step === 1 && pin.length === 6) {
        isCheckingRef.current = true;
        const t = setTimeout(() => {
          handleAction(pin, confirmPin, 1).finally(() => {
            isCheckingRef.current = false;
          });
        }, 120);
        return () => {
          clearTimeout(t);
          isCheckingRef.current = false;
        };
      } else if (step === 2 && confirmPin.length === 6) {
        isCheckingRef.current = true;
        const t = setTimeout(() => {
          handleAction(pin, confirmPin, 2).finally(() => {
            isCheckingRef.current = false;
          });
        }, 120);
        return () => {
          clearTimeout(t);
          isCheckingRef.current = false;
        };
      }
    } else {
      if (pin.length === 6) {
        isCheckingRef.current = true;
        const t = setTimeout(() => {
          handleAction(pin, confirmPin, step).finally(() => {
            isCheckingRef.current = false;
          });
        }, 120);
        return () => {
          clearTimeout(t);
          isCheckingRef.current = false;
        };
      }
    }
  }, [pin, confirmPin, step, isSettingUp, shakeErr]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If the user is typing in some actual other input, do nothing
      if (
        document.activeElement &&
        document.activeElement !== inputRef.current &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.target === inputRef.current) {
        // Let the input's onChange naturally handle numeric key presses and backspace when focused
        // But handle Enter key to submit
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAction();
        }
        return;
      }

      const key = e.key;
      if (key >= '0' && key <= '9') {
        e.preventDefault();
        setErrorMsg('');
        const updateVal = (prev: string) => {
          if (prev.length < 6) return prev + key;
          return prev;
        };
        if (step === 1) {
          setPin(updateVal);
        } else {
          setConfirmPin(updateVal);
        }
        inputRef.current?.focus();
      } else if (key === 'Backspace') {
        e.preventDefault();
        setErrorMsg('');
        const updateVal = (prev: string) => prev.slice(0, -1);
        if (step === 1) {
          setPin(updateVal);
        } else {
          setConfirmPin(updateVal);
        }
        inputRef.current?.focus();
      } else if (key === 'Enter') {
        e.preventDefault();
        handleAction();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [step, pin, confirmPin, isSettingUp]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    setErrorMsg('');
    if (step === 1) {
      setPin(val);
    } else {
      setConfirmPin(val);
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const handleNumClick = (num: number) => {
    setErrorMsg('');
    const updateVal = (prev: string) => {
      if (prev.length < 6) return prev + num;
      return prev;
    };
    if (step === 1) {
      setPin(updateVal);
    } else {
      setConfirmPin(updateVal);
    }
    inputRef.current?.focus();
  };

  const handleDelete = () => {
    const updateVal = (prev: string) => prev.slice(0, -1);
    if (step === 1) {
      setPin(updateVal);
    } else {
      setConfirmPin(updateVal);
    }
    inputRef.current?.focus();
  };

  const renderDots = () => {
    const currentVal = step === 1 ? pin : confirmPin;
    const isNumeric = /^\d+$/.test(currentVal);
    const isInvalid = shakeErr || (currentVal.length > 0 && !isNumeric) || currentVal.length > 6;
    const isValid = currentVal.length === 6 && isNumeric && !shakeErr;

    let containerBorderClass = "border-2 border-brand-secondary/30 bg-brand-surface/40 dark:bg-white/5";
    if (isInvalid) {
      containerBorderClass = "border-2 border-red-500 bg-red-500/10 ring-2 ring-red-500/20";
    } else if (isValid) {
      containerBorderClass = "border-2 border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20";
    }

    return (
      <div className={`flex gap-4 justify-center items-center my-6 px-6 py-3 rounded-2xl transition-all duration-300 ${containerBorderClass} ${shakeErr ? 'animate-shake' : ''}`}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              isInvalid
                ? 'border-red-500 bg-red-500'
                : isValid
                  ? 'border-emerald-500 bg-emerald-500 scale-110'
                  : index < activeLength
                    ? index === lastChangedIndex && changeType === 'add'
                      ? 'border-brand-primary bg-brand-primary scale-150 duration-150'
                      : 'border-brand-primary bg-brand-primary scale-110'
                    : index === lastChangedIndex && changeType === 'delete'
                      ? 'border-brand-primary bg-brand-primary/40 scale-75 duration-150'
                      : 'border-brand-primary/40 bg-transparent'
            }`}
          />
        ))}
      </div>
    );
  };

  const isDesktopPortal = user.role === 'pdg' || user.role === 'branch_admin' || user.role === 'staff';

  return (
    <div 
      id="app-lock-overlay"
      onClick={handleContainerClick}
      className={`fixed inset-0 bg-brand-surface dark:bg-[#0e071a] z-[9999] flex flex-col justify-center items-center ${isDesktopPortal ? 'p-4 bg-brand-surface/90 dark:bg-[#0e071a]/90' : 'p-0 sm:p-6'} animate-fade-in`}
    >
      <div 
        id="app-lock-card"
        onClick={(e) => {
          // Prevent click from bubbling but ensure input focus
          e.stopPropagation();
          handleContainerClick();
        }}
        className={isDesktopPortal 
          ? "max-w-md w-full h-auto bg-white dark:bg-[#1b112d]/95 rounded-3xl shadow-2xl p-8 border border-brand-secondary/30 dark:border-brand-secondary/15 flex flex-col justify-start items-center cursor-default relative"
          : "max-w-md w-full h-full sm:h-auto bg-white dark:bg-[#1b112d]/95 rounded-none sm:rounded-3xl shadow-2xl p-8 border-0 sm:border border-brand-secondary/30 dark:border-brand-secondary/15 flex flex-col justify-center sm:justify-start items-center cursor-default relative"}
      >
        {/* Hidden inputs to capture keyboard & mobile phone input */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={step === 1 ? pin : confirmPin}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleAction();
            }
          }}
          className="absolute opacity-0 w-8 h-8 pointer-events-none"
          autoFocus
        />

        {/* App Lock Logo Badge */}
        <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
          {isSettingUp ? <Key className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
        </div>

        <h2 className="text-xl font-bold font-display text-brand-primary text-center">
          {isSettingUp 
            ? (step === 1 ? text.setup_title : text.confirm_pin)
            : text.enter_title}
        </h2>
        <p className="text-sm text-brand-primary/80 text-center mt-2 px-4">
          {isSettingUp
            ? (step === 1 ? text.setup_subtitle : "Please type your 6-digit PIN code again to confirm setting up lock.")
            : text.enter_subtitle}
        </p>

        {renderDots()}

        {errorMsg && (
          <div className="text-xs font-semibold text-brand-accent mb-4 text-center">
            {errorMsg}
          </div>
        )}

        {/* Custom Dial Keyboard (3x4 Layout) */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              id={`pin-btn-${num}`}
              key={num}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNumClick(num);
              }}
              className="relative aspect-square rounded-full flex items-center justify-center cursor-pointer group"
            >
              <span className="absolute inset-0 rounded-full bg-brand-surface/80 group-hover:bg-brand-secondary/25 border border-brand-secondary/10 transition-colors" />
              <span className="relative z-10 font-semibold text-lg text-brand-primary transition-transform group-active:scale-90">
                {num}
              </span>
            </button>
          ))}
          <button
            id="pin-btn-del"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="aspect-square font-semibold text-xs text-brand-accent rounded-full flex items-center justify-center cursor-pointer transition-all hover:bg-brand-accent/5"
          >
            Del
          </button>
          <button
            id="pin-btn-0"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNumClick(0);
            }}
            className="relative aspect-square rounded-full flex items-center justify-center cursor-pointer group"
          >
            <span className="absolute inset-0 rounded-full bg-brand-surface/80 group-hover:bg-brand-secondary/25 border border-brand-secondary/10 transition-colors" />
            <span className="relative z-10 font-semibold text-lg text-brand-primary transition-transform group-active:scale-90">
              0
            </span>
          </button>
          <button
            id="pin-btn-go"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAction();
            }}
            className="aspect-square bg-brand-primary hover:bg-brand-accent text-white rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Device Autorecovery Fallback label */}
        <div className="mt-8 text-xs text-brand-primary/40 font-numeric">
          Device ID: {(user.unique_display_id)}
        </div>
      </div>
    </div>
  );
};
