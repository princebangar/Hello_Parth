// The web router's catch-all: an old short Food address goes to its /food/... page (the web's RedirectToFood), any
// other unknown address to "/" (which then opens login or the app).
import { Redirect, usePathname, useGlobalSearchParams } from 'expo-router';
import { legacyFoodPath } from '@/lib/router';

export default function NotFound() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const mapped = legacyFoodPath(pathname);
  if (mapped !== pathname) {
    const query = new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]),
    ).toString();
    return <Redirect href={query ? `${mapped}?${query}` : mapped} />;
  }
  return <Redirect href="/" />;
}
