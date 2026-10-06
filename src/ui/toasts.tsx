// App-wide toast notifications.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Toast {
  id: number;
  text: string;
  kind?: 'info' | 'success' | 'error' | 'achievement';
  image?: string;
  title?: string;
}

const Ctx = createContext<(t: Omit<Toast, 'id'> & { ms?: number }) => void>(() => undefined);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'> & { ms?: number }) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.ms ?? (t.kind === 'achievement' ? 6000 : 3500));
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? 'info'}`}>
            {t.image && <img src={t.image} alt="" />}
            <div>
              {t.title && <div style={{ fontWeight: 700 }}>{t.title}</div>}
              <div>{t.text}</div>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
