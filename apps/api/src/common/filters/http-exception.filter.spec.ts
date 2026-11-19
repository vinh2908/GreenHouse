import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * L10 (R11): HttpExceptionFilter phải giữ mã lỗi ổn định do exception tự
 * mang (res.code) thay vì luôn suy mã từ HTTP status. Client match theo mã
 * (vd. EMAIL_NOT_VERIFIED) thay vì theo nội dung message tiếng Việt.
 * Không có code thì hành vi cũ giữ nguyên (400 → BAD_REQUEST...).
 */
function runFilter(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/v1/jobs' }),
    }),
  } as any;
  new HttpExceptionFilter().catch(exception, host);
  return { status, json, body: json.mock.calls[0]?.[0] };
}

describe('HttpExceptionFilter — explicit error code passthrough (L10/R11)', () => {
  it('exception mang code EMAIL_NOT_VERIFIED → body.error.code giữ nguyên mã đó, message giữ nguyên', () => {
    const { status, body } = runFilter(
      new BadRequestException({
        message:
          'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo đơn.',
        code: 'EMAIL_NOT_VERIFIED',
      }),
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe(
      'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo đơn.',
    );
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('BadRequestException thường (không code) → BAD_REQUEST như cũ', () => {
    const { status, body } = runFilter(
      new BadRequestException('Giá mong muốn tối thiểu là 50.000₫'),
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(body.message).toBe('Giá mong muốn tối thiểu là 50.000₫');
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('NotFoundException thường → NOT_FOUND như cũ', () => {
    const { body } = runFilter(new NotFoundException('Job không tồn tại'));
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('lỗi không phải HttpException → 500 INTERNAL_ERROR như cũ', () => {
    const { status, body } = runFilter(new InternalServerErrorException('boom'));
    expect(status).toHaveBeenCalledWith(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
