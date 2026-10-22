import { describe, expect, it } from 'vitest';
import { resultStatus, type ResultState, type ResultStatus } from '../../web/src/lib/result-status';

describe('single result status for tickets and selections', () => {
  const cases: [string, ResultState, ResultStatus][] = [
    ['pending ticket', { result: 'PENDING', playStatus: 'OPEN' }, 'OPEN'],
    ['upcoming selection', { playStatus: 'UPCOMING' }, 'OPEN'],
    ['pending without match progress', { result: 'PENDING' }, 'OPEN'],
    ['running ticket', { result: 'PENDING', playStatus: 'LIVE' }, 'LIVE'],
    ['running match without settlement', { result: 'UNKNOWN', playStatus: 'LIVE' }, 'LIVE'],
    ['lost ticket with games remaining', { result: 'LOST', playStatus: 'LIVE' }, 'CUT'],
    ['lost selection', { result: 'LOST', playStatus: 'PLAYED' }, 'CUT'],
    ['won ticket', { result: 'WON', playStatus: 'ALL_PLAYED' }, 'WIN'],
    ['completed unconfirmed match', { result: 'PENDING', playStatus: 'PLAYED' }, 'UNKNOWN'],
    ['completed unconfirmed ticket', { playStatus: 'ALL_PLAYED' }, 'UNKNOWN'],
    ['unavailable pending ticket', { result: 'PENDING', displayStatus: 'UNAVAILABLE' }, 'UNKNOWN'],
    ['archived confirmed win', { result: 'WON', displayStatus: 'UNAVAILABLE' }, 'WIN'],
    ['void selection retains its settlement in details', { result: 'VOID', playStatus: 'PLAYED' }, 'UNKNOWN'],
    ['unidentified ticket', {}, 'UNKNOWN'],
    ['legacy progress without confirmed loss', { playStatus: 'CUT' }, 'UNKNOWN'],
  ];

  it.each(cases)('%s', (_, state, expected) => {
    expect(resultStatus(state)).toBe(expected);
  });
});
