import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {registerSW} from './services/swReg.ts';
import './index.css';

registerSW();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<div className="p-8 text-center text-white bg-[#120F1A] min-h-screen flex items-center justify-center font-sans text-xs">Application error. Please refresh.</div>}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
