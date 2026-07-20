export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="LibraryBandhu"
      width={size}
      height={size}
      className={`rounded-lg object-contain ${className || ""}`}
    />
  );
}
