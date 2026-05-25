import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SettingsSecretInputProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SettingsSecretInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: SettingsSecretInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <div className="text-sm font-medium text-on-surface">{label}</div>
        {description && (
          <div className="mt-0.5 text-sm text-on-surface-variant">{description}</div>
        )}
      </div>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="w-full px-3 py-2 pr-10 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface transition-colors"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
