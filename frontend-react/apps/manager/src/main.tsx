import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@bs/auth';
import '@bs/ui/tokens.css';
import '@bs/ui/polish.css';
import { PanelThemeProvider } from './features/theme/PanelThemeProvider';
import { App } from './App';

// Sprint P1 — défauts de cache cohérents (perf perçue). Les hooks features gardent leurs staleTime propres.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

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
