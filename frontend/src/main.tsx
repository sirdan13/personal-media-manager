import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './context/ToastContext';
import './index.css';
import { runBenchmark } from './features/scanner/benchmarkRunner';

// Expose benchmark runner for automated CI/CD and headless measurements
(window as unknown as { __pmm_runBenchmark: typeof runBenchmark }).__pmm_runBenchmark = runBenchmark;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
