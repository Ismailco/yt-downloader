import { NextApiRequest, NextApiResponse } from 'next';

export function requireApiKey(req: NextApiRequest, res: NextApiResponse): boolean {
  const headerKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;

  if (!expectedKey || headerKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
