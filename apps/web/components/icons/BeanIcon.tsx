export function BeanIcon({ className }: { className?: string }) {
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
      {/* Coffee bean shape */}
      <ellipse cx="32" cy="32" rx="16" ry="24" />
      {/* Center crease */}
      <path d="M32 12 Q26 24 32 32 Q38 40 32 52" />
    </svg>
  );
}
