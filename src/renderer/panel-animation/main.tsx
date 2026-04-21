import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@renderer/shared/styles/global.css';
import './panel-animation.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
