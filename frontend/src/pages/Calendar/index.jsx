import { Navigate, useSearchParams } from 'react-router-dom';

export default function CalendarPage() {
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date');
  const to = date ? `/tasks?view=calendar&date=${date}` : '/tasks?view=calendar';
  return <Navigate to={to} replace />;
}
