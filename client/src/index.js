// client/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { BranchProvider } from './context/BranchContext';
import { OfflineProvider } from './context/OfflineContext';
import { CartProvider } from './context/CartContext';
// ✅ Import socket but don't auto-connect - let App handle it
import socket, { setupOfflineHandlers } from './socket';

// ✅ Setup offline handlers to prevent flickering
// This only handles network status, not auto-connect
setupOfflineHandlers();

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <BranchProvider>
          <OfflineProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </OfflineProvider>
        </BranchProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);

reportWebVitals();