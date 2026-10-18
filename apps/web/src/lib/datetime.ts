const LAGOS = 'Africa/Lagos';

export function formatLagosDateTime(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-NG', {
    timeZone: LAGOS,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatLagosDate(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-NG', {
    timeZone: LAGOS,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
