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
import { setupOfflineHandlers } from './socket';

// ✅ Only setup offline handlers, don't auto-connect
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