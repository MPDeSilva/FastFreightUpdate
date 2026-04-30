import { pickWinner } from '../lww';

describe('pickWinner (last-write-wins)', () => {
  const local = { id: 'a', updated_at: '2026-04-29T12:00:00Z' };
  const newer = { id: 'a', updated_at: '2026-04-30T12:00:00Z' };
  const equal = { id: 'a', updated_at: '2026-04-29T12:00:00Z' };

  it('returns incoming when local is null', () => {
    expect(pickWinner(null, newer, '', 'a')).toBe(newer);
  });
  it('returns incoming when newer', () => {
    expect(pickWinner(local, newer, 'a', 'a')).toBe(newer);
  });
  it('returns local when incoming older', () => {
    expect(pickWinner(newer, local, 'a', 'a')).toBe(newer);
  });
  it('uses tiebreaker on equal timestamps', () => {
    expect(pickWinner(local, equal, 'a', 'b')).toBe(equal);
    expect(pickWinner(local, equal, 'b', 'a')).toBe(local);
  });
});
