import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import logoUrl from './logo.png';
import './styles.css';

// Use the bundled mascot as the favicon (Vite emits a hashed asset URL).
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
icon.href = logoUrl;

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
