import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from '../db/pool';
import { requireAuth } from '../auth/entra';
import { publish } from '../realtime/signalr';

export const investigationsRouter = Router();

const responseSchema = z.object({
  management_response: z.string().min(1).max(4000),
});

investigationsRouter.post('/:id/response', requireAuth, async (req, res) => {
  const parsed = responseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = req.params.id;
  const now = new Date();
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('response', sql.NVarChar(sql.MAX), parsed.data.management_response)
    .input('updated_at', sql.DateTime2, now)
    .query(
      `UPDATE investigations
         SET management_response = @response,
             resolution_status = 'Responded',
             updated_at = @updated_at
       WHERE id = @id`
    );
  if (result.rowsAffected[0] === 0) {
    res.status(404).json({ error: 'investigation not found' });
    return;
  }
  await publish({ entity: 'investigation', id, updated_at: now.toISOString() });
  res.json({ ok: true, updated_at: now.toISOString() });
});
