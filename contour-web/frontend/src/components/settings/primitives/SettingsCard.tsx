interface SettingsCardProps {
  children: React.ReactNode;
  divided?: boolean;
  className?: string;
}

export function SettingsCard({ children, divided = true, className }: SettingsCardProps) {
  return (
    <div className={`rounded-xl border border-border bg-surface-sunken overflow-hidden ${className ?? ''}`}>
      {divided ? (
        <div className="divide-y divide-border/40">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
