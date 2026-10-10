import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

const missing: string[] = [];
if (typeof structuredClone !== 'function') missing.push('structuredClone');
if (typeof crypto?.getRandomValues !== 'function') missing.push('crypto.getRandomValues');

const root = createRoot(document.getElementById('root')!);
if (missing.length) {
  root.render(
    <div className="title-screen">
      <div className="banner bad" role="alert">
        This browser is missing features Lantern Table needs ({missing.join(', ')}). Please use a current version of Chrome, Edge, Firefox or Safari.
      </div>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
