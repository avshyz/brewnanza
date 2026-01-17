export function EspressoIcon({ className }: { className?: string }) {
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
      {/* Machine body */}
      <rect x="10" y="10" width="30" height="44" rx="2" />
      {/* Top section */}
      <path d="M10 22 L40 22" />
      {/* Portafilter/spout */}
      <path d="M22 22 L22 32" />
      <path d="M28 22 L28 32" />
      {/* Cup */}
      <path d="M18 40 L18 50 Q18 54 25 54 Q32 54 32 50 L32 40" />
      {/* Cup handle */}
      <path d="M32 43 Q38 43 38 47 Q38 51 32 51" />
      {/* Side panel */}
      <rect x="40" y="10" width="14" height="44" rx="2" />
      {/* Panel vents */}
      <path d="M44 18 L50 18" />
      <path d="M44 26 L50 26" />
      <path d="M44 34 L50 34" />
      {/* Dial */}
      <circle cx="47" cy="44" r="4" />
    </svg>
  );
}
