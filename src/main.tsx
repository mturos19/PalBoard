import './platform/polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { createWebApi } from './platform/webApi'
import './styles/index.css'

// The pages talk to `window.palboard` and nothing else. Installing it here, in
// place of what the desktop preload bridge injects, is the whole of the port.
window.palboard = createWebApi()

/**
 * Save data arrives by push from the platform layer, not by fetching, so queries
 * never need to refetch on their own. TanStack Query is kept for derived and
 * on-demand work (exports, future plugin data sources).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* HashRouter: the packaged app loads from file://, where history routing breaks. */}
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
