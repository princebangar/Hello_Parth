import { ArrowLeft, Layers, ShieldCheck, Wallet } from 'lucide-react';
import { useSettings } from '../../../../shared/context/SettingsContext';
import heroImage from '../../../../assets/images/driver-login-bg.png';
import './AuthShell.css';

// The partner sign-in screens are always light, whatever theme the customer app is set to. The taxi theme
// layer remaps utility classes (bg-white, text-slate-*, inputs...) onto these variables, so pinning them
// here keeps every screen inside the shell readable in both themes.
const LIGHT_SCOPE = {
  '--user-bg': '#f6f7fb',
  '--user-card-bg': '#ffffff',
  '--user-card-soft': '#f1f3f8',
  '--user-text-primary': '#0b1220',
  '--user-text-secondary': '#334155',
  '--user-text-muted': '#64748b',
  '--user-border': 'rgba(15, 23, 42, 0.12)',
  '--user-accent': '#ffc400',
};

const BRAND_POINTS = [
  {
    Icon: Layers,
    title: 'Every partner role in one place',
    text: 'Taxi drivers, fleet owners, pooling and bus partners all sign in here.',
  },
  {
    Icon: Wallet,
    title: 'Earnings at a glance',
    text: 'Follow trips, wallet balance and withdrawals as they happen.',
  },
  {
    Icon: ShieldCheck,
    title: 'Secure OTP sign-in',
    text: 'No password to remember. Your mobile number is your login.',
  },
];

const Brand = ({ appName, appLogo, onDark = false }) => (
  <div className="flex items-center gap-3">
    {appLogo ? (
      <img
        src={appLogo}
        alt={`${appName} logo`}
        className="h-10 w-10 rounded-xl bg-[#ffffff] object-cover p-1 shadow-[0_6px_18px_-8px_rgba(15,23,42,0.45)]"
      />
    ) : (
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffc400] text-lg font-bold text-[#0b1220]">
        {String(appName || 'P').trim().charAt(0).toUpperCase()}
      </span>
    )}
    <span className={`text-base font-semibold tracking-tight ${onDark ? 'text-[#ffffff]' : 'text-[#0b1220]'}`}>
      {appName}
    </span>
  </div>
);

/**
 * Responsive frame for the partner sign-in screens (login, OTP, role selection).
 * - phones: a compact hero strip on top and the form below it, full width
 * - tablets: the same, with the form held to a readable column
 * - desktop (lg+): brand panel on the left, form on the right
 */
const AuthShell = ({ eyebrow, title, subtitle, onBack, backLabel = 'Back', children, footer }) => {
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'Partner App';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';

  return (
    <div
      style={LIGHT_SCOPE}
      className="relative isolate min-h-dvh w-full overflow-x-hidden bg-[#f6f7fb] text-[#0b1220] lg:grid lg:grid-cols-[1.05fr_1fr]"
    >
      {/* Brand panel — desktop only */}
      <aside className="relative hidden lg:block">
        <div className="sticky top-0 flex h-dvh flex-col justify-between overflow-hidden p-12 xl:p-16">
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(9,12,28,0.94)] via-[rgba(9,12,28,0.6)] to-[rgba(9,12,28,0.4)]" />
          <div className="relative">
            <Brand appName={appName} appLogo={appLogo} onDark />
          </div>
          <div className="relative max-w-md space-y-9">
            <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight text-[#ffffff] xl:text-[2.75rem]">
              Drive, earn and grow with {appName}.
            </h2>
            <ul className="space-y-5">
              {BRAND_POINTS.map(({ Icon, title: pointTitle, text }) => (
                <li key={pointTitle} className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.14)] text-[#ffc400]">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-[#ffffff]">{pointTitle}</span>
                    <span className="mt-0.5 block text-sm leading-6 text-[rgba(255,255,255,0.72)]">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <div className="relative flex min-h-dvh flex-col lg:bg-[#ffffff]">
        {/* Hero strip — phones and tablets */}
        <div className="relative h-28 shrink-0 overflow-hidden sm:h-44 lg:hidden">
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(9,12,28,0.55)] via-[rgba(9,12,28,0.4)] to-[#f6f7fb]" />
          <div className="relative px-5 pt-5 sm:px-8 sm:pt-7">
            <Brand appName={appName} appLogo={appLogo} onDark />
          </div>
        </div>

        <main className="relative z-10 flex flex-1 flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 sm:px-8 lg:justify-center lg:px-12 lg:py-12 xl:px-20">
          <div className="mx-auto w-full max-w-md">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="-ml-2 mb-5 inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[#475569] transition-colors hover:bg-[rgba(15,23,42,0.06)] active:bg-[rgba(15,23,42,0.1)]"
              >
                <ArrowLeft size={18} strokeWidth={2.4} />
                {backLabel}
              </button>
            )}

            <header className={onBack ? '' : 'pt-3 lg:pt-0'}>
              {eyebrow && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#b45309]">{eyebrow}</p>
              )}
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[#0b1220] sm:text-3xl">
                {title}
              </h1>
              {subtitle && <p className="mt-2 text-[15px] leading-6 text-[#64748b]">{subtitle}</p>}
            </header>

            <div className="mt-6">{children}</div>

            {footer && <div className="mt-6">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuthShell;
