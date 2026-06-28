import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@bs/auth';
import '@bs/ui/tokens.css';
import { PanelThemeProvider } from './features/theme/PanelThemeProvider';
import { App } from './App';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PanelThemeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PanelThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
