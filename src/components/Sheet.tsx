import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Hide the close button, for flows that must be finished (onboarding). */
  dismissible?: boolean;
}

/** A storybook-styled modal built on the native <dialog>, which gives focus trapping and Escape for free. */
export function Sheet({ open, onClose, title, children, dismissible = true }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2 id={titleId}>{title}</h2>
            {dismissible && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
