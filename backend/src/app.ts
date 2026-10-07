import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { allowAnyCorsOrigin, corsOrigins, env } from './config.js';
import { prisma } from './db.js';
import { HttpError } from './errors.js';
import { errorHandler } from './middleware/error-handler.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import measurementRoutes from './routes/measurement.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import reportRoutes from './routes/report.routes.js';
import auditRoutes from './routes/audit.routes.js';
import platformRoutes from './routes/platform.routes.js';
import syncRoutes from './routes/sync.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import whatsappWebhookRoutes from './routes/whatsapp-webhook.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import platformBillingRoutes from './routes/platform-billing.routes.js';
import templateRoutes from './routes/template.routes.js';
import businessRoutes from './routes/business.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import businessStructureRoutes from './routes/business-structure.routes.js';
import staffRoutes from './routes/staff.routes.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      rawBody?: Buffer;
    }
  }
}

const logger = pino({ level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] });
export const app = express();

app.disable('x-powered-by');
if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use((req, res, next) => {
  const requestedId = req.header('x-request-id');
  req.requestId = requestedId && /^[a-zA-Z0-9._-]{1,64}$/.test(requestedId) ? requestedId : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});
app.use(pinoHttp({
  logger,
  genReqId: (req) => (req as express.Request).requestId,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      path: req.url?.split('?')[0],
    }),
  },
}));
app.use(helmet({
  // With a wildcard origin the API is explicitly meant to be read from other
  // origins, so the default same-origin resource policy would be misleading.
  crossOriginResourcePolicy: { policy: allowAnyCorsOrigin ? 'cross-origin' : 'same-origin' },
}));
app.use(cors({
  origin(origin, callback) {
    if (allowAnyCorsOrigin || !origin || corsOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new HttpError(403, 'Origin is not allowed by CORS', 'CORS_ORIGIN_DENIED'));
  },
  // Bearer auth only — no cookies — so the permissive origin stays safe.
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['x-request-id'],
  maxAge: 600,
}));
app.options(/.*/, cors());
app.use(express.json({
  limit: '256kb',
  strict: true,
  verify: (req, _res, buffer) => {
    (req as express.Request).rawBody = Buffer.from(buffer);
  },
}));
app.use((req, _res, next) => {
  if (req.url === '/backend' || req.url.startsWith('/backend/') || req.url.startsWith('/backend?')) {
    req.url = req.url.slice('/backend'.length) || '/';
    if (req.url.startsWith('?')) req.url = `/${req.url}`;
  }
  next();
});
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests; please try again later' },
    requestId: req.requestId,
  }),
}));

app.get('/api/v1/health', (_req, res) => {
  res.json({ data: { status: 'ok', service: 'tailor-api', timestamp: new Date().toISOString() } });
});

app.get('/api/v1/ready', async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: 'ready', database: 'connected' } });
  } catch (error) {
    req.log.error({ cause: error instanceof Error ? error.name : 'unknown' }, 'Readiness database check failed');
    next(new HttpError(503, 'Database is unavailable', 'SERVICE_UNREADY'));
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/measurements', measurementRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/platform', platformRoutes);
app.use('/api/v1/platform/templates', templateRoutes);
app.use('/api/v1/business', businessStructureRoutes);
app.use('/api/v1/business', staffRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/platform/billing', platformBillingRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/webhooks/whatsapp', whatsappWebhookRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});
app.use(errorHandler);

export { logger };
