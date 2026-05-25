"use client";
import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

export function HelpTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-gray-400 hover:text-blue-600 transition-colors"
        aria-label="Show help"
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <div className="absolute z-20 top-5 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-700 leading-relaxed font-normal normal-case">
          {children}
        </div>
      )}
    </span>
  );
}
