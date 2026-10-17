import { redirect } from 'react-router';
import type { Route } from './+types/_index';

/** / → /dashboard */
export function loader(_: Route.LoaderArgs) {
  throw redirect('/dashboard');
}

export default function Index() {
  return null;
}
