import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import faviconUrl from './favicon.png';
import './styles.css';

// Square favicon (mascot fit into a square canvas) so the tab icon isn't stretched.
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
icon.href = faviconUrl;

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
