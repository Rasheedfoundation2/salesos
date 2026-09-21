export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path d="M9 21.5 14 16l3.5 3.5L23 12" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="12" r="2.2" fill="#fff" />
    </svg>
  );
}
