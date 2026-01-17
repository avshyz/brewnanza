export function FilterIcon({ className }: { className?: string }) {
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
      {/* V60 dripper body */}
      <path d="M12 16 L52 16 L38 48 L26 48 Z" />
      {/* Diagonal ridges inside */}
      <path d="M20 20 L30 44" />
      <path d="M28 18 L35 40" />
      <path d="M36 18 L40 32" />
      {/* Handle */}
      <path d="M52 16 Q60 20 56 32 Q54 38 48 36" />
      {/* Base/stand line */}
      <path d="M8 48 L56 48" />
    </svg>
  );
}
