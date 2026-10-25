/**
 * AuthInitializer - Recovers auth state from storage on app initialization.
 * The storage shim is synchronous once the root layout has hydrated it (src/lib/storage.js), so there is nothing to
 * wait for: render children immediately. ProtectedRoute handles auth checks per-route.
 */
export default function AuthInitializer({ children }) {
  return children;
}
