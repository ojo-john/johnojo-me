"use client";

/** Opens the résumé viewer that lives in the header, from anywhere on the page. */
export function ResumeButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} data-track="résumé: open" onClick={() => window.dispatchEvent(new Event("open-resume"))}>
      {children}
    </button>
  );
}
