import { useEffect, useRef } from "react";
import gsap from "gsap";

interface AnimatedSloganProps {
  slogan: string;
  className?: string;
}

/**
 * Splits a comma-separated slogan string into individual phrases and cycles
 * through them one at a time using GSAP, looping forever. Automatically
 * restarts cleanly whenever the `slogan` prop changes (e.g. on language switch).
 *
 * All phrase <span> elements are absolutely positioned on top of one another
 * inside a relatively-positioned "canvas" div, so only one phrase is ever
 * visible in the exact same spot at a time — this is what makes the fade/zoom
 * transition look like one phrase replacing another in place, instead of the
 * phrases stacking vertically in normal document flow.
 */
export function AnimatedSlogan({ slogan, className = "" }: AnimatedSloganProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const phrases = slogan
      .split(",")
      .map((phrase) => {
        const trimmed = phrase.trim();
        // Capitalize the first letter of each word in the phrase
        return trimmed
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      })
      .filter((phrase) => phrase.length > 0);

    const el = containerRef.current;
    if (!el || phrases.length === 0) return;

    el.innerHTML = "";
    const spans: HTMLSpanElement[] = phrases.map((phrase) => {
      const span = document.createElement("span");
      span.textContent = phrase;
      // Absolute positioning + full-width + centered text is what makes every
      // phrase render in the exact same spot, so the animation replaces one
      // phrase with the next in place rather than pushing the layout up/down.
      span.style.position = "absolute";
      span.style.inset = "0";
      span.style.display = "flex";
      span.style.alignItems = "center";
      span.style.justifyContent = "center";
      span.style.width = "100%";
      span.style.textAlign = "center";
      span.style.opacity = "0";
      el.appendChild(span);
      return span;
    });

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1 });

      spans.forEach((span) => {
        tl.fromTo(
          span,
          { autoAlpha: 0, scale: 0.7 },
          { autoAlpha: 1, scale: 1, duration: 0.7, ease: "power4.out" }
        )
          .to(span, { autoAlpha: 1, scale: 1, duration: 1.4 }) // hold
          .to(span, { autoAlpha: 0, scale: 1.15, duration: 0.6, ease: "power2.in" });
      });
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [slogan]);

  return (
    <div
      className={`relative w-full flex items-center justify-center overflow-hidden bg-transparent border border-white/15 rounded-xl px-4 ${className}`}
      style={{ minHeight: "2.6em" }}
    >
      <div
        ref={containerRef}
        className="relative w-full text-center font-display font-bold text-base sm:text-lg text-brand-primary dark:text-white"
        style={{ position: "relative", minHeight: "2.6em" }}
      />
    </div>
  );
}
