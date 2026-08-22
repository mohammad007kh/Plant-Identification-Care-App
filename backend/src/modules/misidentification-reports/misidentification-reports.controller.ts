import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { createMisidentificationReportRequestSchema, type MisidentificationReport } from 'shared';
import { OptionalUserId } from '../../common/auth/optional-user';
import { Public } from '../auth/public.decorator';
import { MisidentificationReportsService } from './misidentification-reports.service';

/**
 * `POST /v1/misidentification-reports` (guest-allowed — a guest's scan must be
 * reportable per US1, so this had no auth guard). Marked `@Public()` (T-057) to
 * PRESERVE that guest-reachable behavior under the new global JwtAuthGuard.
 * NOTE: the OpenAPI contract does NOT list this route as `security: []` — a
 * known spec/implementation discrepancy; behavior is preserved here and the
 * mismatch is flagged for reconciliation (do not silently make it protected).
 */
@Public()
@Controller('misidentification-reports')
export class MisidentificationReportsController {
  constructor(private readonly reports: MisidentificationReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: unknown,
    @OptionalUserId() userId: string | null,
  ): Promise<MisidentificationReport> {
    const parsed = createMisidentificationReportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
    }

    return this.reports.submitReport({
      scanPublicId: parsed.data.scanId,
      note: parsed.data.note,
      requesterUserId: userId,
    });
  }
}
