import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { SportyBetHttpError } from '../bookmaker/sportybet.client';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : (payload as { message?: string | string[] }).message ??
            exception.message;
      res.status(status).json({
        statusCode: status,
        message: Array.isArray(message) ? message.join(', ') : message,
      });
      return;
    }

    if (exception instanceof SportyBetHttpError) {
      const status = mapSportyStatus(exception);
      this.logger.warn(`${exception.code}: ${exception.message}`);
      res.status(status).json({
        statusCode: status,
        code: exception.code,
        message: userFacingSportyMessage(exception),
      });
      return;
    }

    const requestId = randomUUID();
    const req = host.switchToHttp().getRequest();
    this.logger.error(JSON.stringify({ requestId, type: exception instanceof Error ? exception.name : 'unknown', method: req.method, route: req.route?.path ?? 'unmatched' }));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      requestId,
      statusCode: 500,
      message: 'Something went wrong. Please try again.',
    });
  }
}

function mapSportyStatus(err: SportyBetHttpError): number {
  if (err.code === 'NOT_FOUND' || err.code === 'INVALID_BOOKING_CODE') {
    return HttpStatus.NOT_FOUND;
  }
  if (err.code === 'RATE_LIMITED') return HttpStatus.TOO_MANY_REQUESTS;
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK') {
    return HttpStatus.BAD_GATEWAY;
  }
  if (err.status && err.status >= 400 && err.status < 600) return err.status;
  return HttpStatus.BAD_GATEWAY;
}

function userFacingSportyMessage(err: SportyBetHttpError): string {
  if (err.code === 'NOT_FOUND') {
    return 'That SportyBet code was not found or has expired.';
  }
  if (err.code === 'RATE_LIMITED') {
    return 'SportyBet is busy. Wait a moment and try again.';
  }
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK') {
    return 'Could not reach SportyBet. Try again shortly.';
  }
  if (err.code === 'UPSTREAM') {
    return 'SportyBet rejected the request. Markets may have changed — try again.';
  }
  return 'SportyBet request failed. Try again.';
}
