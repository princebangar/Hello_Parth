import { Check } from 'lucide-react';
import { DRIVER_ROLES } from '../../utils/driverRoles';

/**
 * Radio group of the partner roles.
 * variant "row": all 4 roles in a single compact row, icon + label only (login screen).
 * variant "list": one wide row per role, with its description (legacy role-selection screen).
 */
const RolePicker = ({ value, onChange, disabled = false, variant = 'row', label = 'Choose your role' }) => {
  const isRow = variant === 'row';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={isRow ? 'grid grid-cols-4 gap-1.5 sm:gap-2' : 'space-y-3'}
    >
      {DRIVER_ROLES.map(({ id, label: roleLabel, description, Icon, accent, tint }) => {
        const active = id === value;

        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            style={active ? { borderColor: accent, backgroundColor: tint } : undefined}
            className={`relative flex rounded-xl border-2 text-center transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b1220] disabled:cursor-not-allowed disabled:opacity-60 ${
              isRow ? 'flex-col items-center gap-1 px-1 py-2' : 'items-center gap-4 p-4 text-left'
            } ${active ? '' : 'border-[#e2e8f0] bg-[#ffffff] hover:border-[#cbd5e1] active:scale-[0.99]'}`}
          >
            <span
              className={`flex shrink-0 items-center justify-center rounded-lg ${isRow ? 'h-8 w-8' : 'h-10 w-10 rounded-xl'}`}
              style={{ backgroundColor: tint, color: accent }}
            >
              <Icon size={isRow ? 16 : 20} strokeWidth={2.2} />
            </span>
            <span className={isRow ? 'min-w-0' : 'min-w-0 pr-5'}>
              <span
                className={
                  isRow
                    ? 'block text-[10.5px] font-semibold leading-[1.1] text-[#0b1220]'
                    : 'block text-[15px] font-semibold leading-5 text-[#0b1220]'
                }
              >
                {isRow ? roleLabel.replace(' Driver', '').replace('Fleet ', '') : roleLabel}
              </span>
              {!isRow && (
                <span className="mt-0.5 block text-xs leading-[1.15rem] text-[#64748b]">{description}</span>
              )}
            </span>
            {active && (
              <span
                className={
                  isRow
                    ? 'absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[#ffffff]'
                    : 'absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[#ffffff]'
                }
                style={{ backgroundColor: accent }}
              >
                <Check size={isRow ? 9 : 12} strokeWidth={3.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default RolePicker;
