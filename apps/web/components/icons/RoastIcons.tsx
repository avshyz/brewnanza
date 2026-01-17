export function LightRoastIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function MediumRoastIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className={className}>
      <defs>
        <clipPath id="half">
          <rect x="0" y="0" width="12" height="24" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="9" fill="none" />
      <circle cx="12" cy="12" r="9" clipPath="url(#half)" stroke="none" />
    </svg>
  );
}

export function DarkRoastIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
