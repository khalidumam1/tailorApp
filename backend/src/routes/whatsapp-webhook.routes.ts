import express from 'express';
import { env } from '../config.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { applyMetaWebhook, verifyMetaChallengeToken, verifyMetaSignature } from '../whatsapp.js';

const router = express.Router();

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string'
    || !verifyMetaChallengeToken(token)) {
    res.sendStatus(403);
    return;
  }
  res.status(200).type('text/plain').send(challenge);
});

router.post('/', asyncHandler(async (req, res) => {
  if (!env.WHATSAPP_ENABLED || !verifyMetaSignature(req.rawBody, req.header('x-hub-signature-256'))) {
    res.sendStatus(401);
    return;
  }
  await applyMetaWebhook(req.body);
  res.sendStatus(200);
}));

export default router;
