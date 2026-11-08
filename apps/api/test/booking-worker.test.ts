import { describe, expect, it, vi } from 'vitest';
import { CreateBookingProcessor } from '../src/jobs/create-booking.processor';

const selections: any[] = [{ eventId: '1', marketId: '1', outcomeId: '1', specifier: '', odds: 1.5 }];
const data: any = { jobId: 'job', groupId: 'group', selections, config: { minimumOdds: 1.2, maximumOdds: 2 } };
function setup(booking: any, completedTasks: string[] = []) {
  const bookmaker = { createBooking: vi.fn().mockResolvedValue(booking) };
  const slips = { audit: vi.fn().mockResolvedValue(undefined), settleBooking: vi.fn().mockResolvedValue(undefined) };
  const prisma = { trainingEvent: { findUnique: vi.fn().mockResolvedValue(null) }, generationJob: { findUniqueOrThrow: vi.fn().mockResolvedValue({ completedTasks }) } };
  const validator = { validate: vi.fn().mockResolvedValue(selections) };
  const worker = new CreateBookingProcessor(bookmaker as any, slips as any, prisma as any, validator as any);
  return { worker, bookmaker, slips, validator, prisma };
}
const confirmed = { code: 'ABC123', shareUrl: 'https://example.com', deadline: null, selections, unavailableOutcomes: [] };

describe('booking confirmation boundary', () => {
  it('saves confirmed selections', async () => {
    const { worker, slips } = setup(confirmed);
    await worker.process({ id: 'task', name: 'create-booking', data, updateData: vi.fn() } as any);
    expect(slips.settleBooking).toHaveBeenCalledWith('task', data, confirmed, selections);
  });
  it('rejects partial booking acceptance', async () => {
    const { worker, slips } = setup({ ...confirmed, unavailableOutcomes: selections });
    await worker.process({ id: 'task', name: 'create-booking', data, updateData: vi.fn() } as any);
    expect(slips.settleBooking).toHaveBeenCalledWith('task', expect.objectContaining({ ...data, failure: expect.objectContaining({ code: 'UNAVAILABLE_MARKET' }) }));
  });
  it('rejects mismatched selections', async () => {
    const { worker, slips } = setup({ ...confirmed, selections: [{ ...selections[0], eventId: 'other' }] });
    await worker.process({ id: 'task', name: 'create-booking', data, updateData: vi.fn() } as any);
    expect(slips.settleBooking).toHaveBeenCalledWith('task', expect.objectContaining({ ...data, failure: expect.objectContaining({ code: 'UNAVAILABLE_MARKET' }) }));
  });
  it('rechecks confirmed odds against the requested range', async () => {
    const { worker, slips } = setup({ ...confirmed, selections: [{ ...selections[0], odds: 9 }] });
    await worker.process({ id: 'task', name: 'create-booking', data, updateData: vi.fn() } as any);
    expect(slips.settleBooking).toHaveBeenCalledWith('task', expect.objectContaining({ ...data, failure: expect.objectContaining({ code: 'UNAVAILABLE_MARKET' }) }));
  });
  it('skips already settled tasks', async () => {
    const { worker, bookmaker } = setup(confirmed, ['task']);
    await worker.process({ id: 'task', name: 'create-booking', data, updateData: vi.fn() } as any);
    expect(bookmaker.createBooking).not.toHaveBeenCalled();
  });
});

it('retries persistence using the saved upstream confirmation', async () => {
  const { worker, slips, bookmaker } = setup(confirmed);
  const payload = { ...data, confirmed: { booking: confirmed, selections } };
  await worker.process({ id: 'task', name: 'create-booking', data: payload } as any);
  expect(bookmaker.createBooking).not.toHaveBeenCalled();
  expect(slips.settleBooking).toHaveBeenCalledWith('task', payload, confirmed, selections);
});
it('does not discard a confirmed code when the database write fails', async () => {
  const { worker, slips } = setup(confirmed);
  const updateData = vi.fn().mockResolvedValue(undefined);
  slips.settleBooking.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(worker.process({ id: 'task', name: 'create-booking', data, updateData } as any)).rejects.toThrow('Database unavailable');
  expect(slips.audit).toHaveBeenCalledWith(data, 'BOOKING_CONFIRMED', { booking: confirmed, selections }, 'task:booking-confirmed');
  expect(slips.settleBooking).toHaveBeenCalledTimes(1);
});

it('recovers an accepted code from the database journal after Redis work is lost', async () => {
  const { worker, slips, bookmaker, prisma } = setup(confirmed);
  prisma.trainingEvent.findUnique.mockResolvedValueOnce({ payload: { booking: confirmed, selections } });
  await worker.process({ id: 'task', name: 'create-booking', data } as any);
  expect(bookmaker.createBooking).not.toHaveBeenCalled();
  expect(slips.settleBooking).toHaveBeenCalledWith('task', data, confirmed, selections);
});
it('does not repeat an interrupted provider POST without confirmation', async () => {
  const { worker, slips, bookmaker, prisma } = setup(confirmed);
  prisma.trainingEvent.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ payload: {} });
  await worker.process({ id: 'task', name: 'create-booking', data } as any);
  expect(bookmaker.createBooking).not.toHaveBeenCalled();
  expect(slips.settleBooking).toHaveBeenCalledWith('task', expect.objectContaining({ failure: expect.objectContaining({ code: 'BOOKING_UNCERTAIN', retryable: false }) }));
});
it('retains the confirmation in Redis if the database journal cannot be written', async () => {
  const { worker, slips } = setup(confirmed);
  slips.audit.mockImplementation(async (_data: any, kind: string) => { if (kind === 'BOOKING_CONFIRMED') throw new Error('DB down'); });
  const updateData = vi.fn();
  await worker.process({ id: 'task', name: 'create-booking', data, updateData } as any);
  expect(updateData).toHaveBeenCalledWith({ ...data, confirmed: { booking: confirmed, selections } });
});
