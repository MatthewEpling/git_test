// Dialogs built on <dialog>: focus trapping, Escape and the backdrop come from the browser.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: 'modal' | 'sheet';
  narrow?: boolean;
  /** Content placed between the header and the scrolling body (e.g. tabs). */
  header?: ReactNode;
  bodyClass?: string;
}

export function Modal({ open, onClose, title, children, variant = 'modal', narrow, header, bodyClass = 'modal-body' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${variant}${narrow ? ' narrow' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <>
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon.Close />
            </button>
          </div>
          {header}
          <div className={bodyClass}>{children}</div>
        </>
      )}
    </dialog>
  );
}
