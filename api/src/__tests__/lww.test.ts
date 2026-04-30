describe('Last-Write-Wins (server semantics)', () => {
  // Smoke test for the comparison rule used by upsertShipment / upsertInvestigation:
  // an incoming row only wins when its updated_at is strictly greater than the row in DB.
  const cmp = (incoming: string, current: string) =>
    incoming > current ? 'ok' : 'conflict';

  it('rejects older incoming', () => {
    expect(cmp('2026-04-29T12:00:00Z', '2026-04-30T12:00:00Z')).toBe('conflict');
  });
  it('accepts newer incoming', () => {
    expect(cmp('2026-05-01T12:00:00Z', '2026-04-30T12:00:00Z')).toBe('ok');
  });
  it('rejects equal timestamps (server keeps its row)', () => {
    expect(cmp('2026-04-30T12:00:00Z', '2026-04-30T12:00:00Z')).toBe('conflict');
  });
});
