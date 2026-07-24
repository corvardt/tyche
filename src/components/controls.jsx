/**
 * Every control in the instrument reads as the same kind of thing: a small caps
 * label that lights up when you point at it. Brackets are the control, not
 * decoration; there are no buttons with fills in here.
 */
export const CONTROL =
  'text-2xs uppercase tracking-label text-dim transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-30';

/** Lit variant, for a control that is currently doing something. */
export const CONTROL_ON = 'text-2xs uppercase tracking-label text-text glow';

/** Splits a run of controls into what they do. */
export const Rule = () => <span className="h-2.5 w-px shrink-0 bg-line" aria-hidden="true" />;

/**
 * Label and value, the readout pair the whole interface is built from. The
 * value glows because it is live; the label never does.
 *
 * @param {{label: string, value: React.ReactNode, hot?: boolean, className?: string}} props
 */
export function Readout({ label, value, hot = false, className = '' }) {
  return (
    <span className={`flex items-baseline gap-2 ${className}`}>
      <span className="text-2xs uppercase tracking-label text-dim">{label}</span>
      <span className={hot ? 'glow-hot text-xs text-strike' : 'glow text-xs text-text'}>
        {value}
      </span>
    </span>
  );
}
