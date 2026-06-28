import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@bs/auth';
import '@bs/ui/tokens.css';
import { VitrineThemeProvider } from './features/theme/VitrineThemeProvider';
import { CartProvider } from './features/cart/CartProvider';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VitrineThemeProvider>
          <CartProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </CartProvider>
        </VitrineThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
