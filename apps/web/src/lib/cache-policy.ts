import type { GeneratedSlip } from './api';

export function confirmedFinalTicket(ticket?: GeneratedSlip): boolean {
  return !!ticket && ['WON', 'LOST', 'VOID'].includes(ticket.result ?? '') && ticket.playStatus === 'ALL_PLAYED'
    && !!ticket.playCheckedAt && ticket.selections.length > 0 && ticket.selections.every(selection =>
      ['WON', 'LOST', 'VOID'].includes(selection.result ?? '') && selection.matchPhase === 'finished' && !!selection.resultCheckedAt);
}
