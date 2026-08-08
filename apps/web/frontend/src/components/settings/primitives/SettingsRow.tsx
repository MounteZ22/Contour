interface SettingsRowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SettingsRow({ label, description, children, className }: SettingsRowProps) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${className ?? ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && (
          <div className="mt-0.5 text-sm text-text-secondary">{description}</div>
        )}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  );
}
