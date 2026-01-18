export function ProducerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Head */}
      <circle cx="32" cy="18" r="10" />
      {/* Body/shoulders */}
      <path d="M14 54 Q14 38 32 38 Q50 38 50 54" />
    </svg>
  );
}
