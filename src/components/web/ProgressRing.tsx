type ProgressRingProps = {
  owned: number;
  total: number;
  label: string;
  size?: number;
};

/** One Collection's progress as a cream ring with "owned/total" inside. */
export function ProgressRing({ owned, total, label, size = 64 }: ProgressRingProps) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, owned / total) : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={owned}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-hairline-strong)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="var(--color-text)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-text">
          {owned}/{total}
        </span>
      </div>
      <span className="max-w-full truncate text-[11px] text-secondary">{label}</span>
    </div>
  );
}
