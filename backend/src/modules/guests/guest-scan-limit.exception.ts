import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when a guest session has used its 2 free scans. Maps to HTTP 403 —
 * the client shows the registration wall (US2). Persian detail by default.
 */
export class GuestScanLimitExceededException extends HttpException {
  constructor(detail = 'سقف اسکن مهمان (۲ عدد) به پایان رسید. برای ادامه لطفاً ثبت‌نام کنید.') {
    super({ code: 'guest_scan_limit_exceeded', detail }, HttpStatus.FORBIDDEN);
  }
}

/**
 * Per-IP daily backstop tripped: one IP tried to mint too many guest sessions
 * in a day (cookie-clearing abuse). Maps to HTTP 429.
 */
export class GuestIpDailyLimitException extends HttpException {
  constructor(detail = 'تعداد درخواست‌های مهمان از این شبکه امروز بیش از حد مجاز است.') {
    super({ code: 'guest_ip_daily_limit', detail }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
