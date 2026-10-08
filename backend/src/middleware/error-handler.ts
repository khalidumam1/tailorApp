import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';

function errorType(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('type' in error)) return undefined;
  return typeof error.type === 'string' ? error.type : undefined;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  // body-parser's SyntaxError includes the submitted body on the error object.
  // Normalize parser failures without logging that potentially sensitive payload.
  const parserType = errorType(error);
  if (parserType === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON' },
      requestId: req.requestId,
    });
    return;
  }
  if (parserType === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
      requestId: req.requestId,
    });
    return;
  }
  if (parserType === 'encoding.unsupported') {
    res.status(415).json({
      error: { code: 'UNSUPPORTED_ENCODING', message: 'Request body encoding is not supported' },
      requestId: req.requestId,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten() },
      requestId: req.requestId,
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
      requestId: req.requestId,
    });
    return;
  }

  req.log.error({ err: error }, 'Unhandled request error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    requestId: req.requestId,
  });
};
