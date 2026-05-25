interface SettingsCardProps {
  children: React.ReactNode;
  divided?: boolean;
  className?: string;
}

export function SettingsCard({ children, divided = true, className }: SettingsCardProps) {
  return (
    <div className={`rounded-xl border border-outline-variant bg-surface-container overflow-hidden ${className ?? ''}`}>
      {divided ? (
        <div className="divide-y divide-outline-variant/40">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
