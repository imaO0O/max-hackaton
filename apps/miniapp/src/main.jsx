import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MaxUI } from '@maxhub/max-ui';

import '@maxhub/max-ui/dist/styles.css';
import './styles.css';

import { App } from './App.jsx';
import { notifyReady } from './lib/max-bridge.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MaxUI>
      <App />
    </MaxUI>
  </StrictMode>,
);

notifyReady();
