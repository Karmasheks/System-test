import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'wouter';
import { expect, test, describe } from '@jest/globals';
import App from './App';

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
};

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('App Component', () => {
  test('renders login page by default when not authenticated', () => {
    renderWithProviders(<App />);
    // Login page should have input fields for credentials
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });

  test('renders StarLine branding on login page', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('StarLine')).toBeInTheDocument();
  });
});