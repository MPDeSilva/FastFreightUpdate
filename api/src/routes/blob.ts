import { Router } from 'express';
import { z } from 'zod';
import { issueSas } from '../blob/sas';
import { requireAuth } from '../auth/entra';

export const blobRouter = Router();

const sasSchema = z.object({
  filename: z.string().min(1).max(500),
  content_type: z.string().min(1).max(100),
});

blobRouter.post('/sas', requireAuth, (req, res) => {
  const parsed = sasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.filename.includes('..')) {
    res.status(400).json({ error: 'invalid filename' });
    return;
  }
  res.json(issueSas(parsed.data));
});
