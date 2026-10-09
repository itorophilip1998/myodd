import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(bucket: string, limitPerMinute: number) {
    const key = `rl:${bucket}:${Math.floor(Date.now() / 60000)}`;
    try {
      if (
        this.redis.client.status !== 'ready' &&
        this.redis.client.status !== 'connecting'
      ) {
        await this.redis.client.connect();
      }
      const count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, 60);
      }
      if (count > limitPerMinute) {
        throw new HttpException(
          'Too many requests. Please wait a minute and try again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Fail open if Redis is briefly unavailable
    }
  }
}
