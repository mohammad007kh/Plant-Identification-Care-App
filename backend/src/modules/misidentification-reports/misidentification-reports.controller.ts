import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { createMisidentificationReportRequestSchema, type MisidentificationReport } from 'shared';
import { OptionalUserId } from '../../common/auth/optional-user';
import { MisidentificationReportsService } from './misidentification-reports.service';

/**
 * `POST /v1/misidentification-reports` (guest-allowed — no auth guard, since a
 * guest's scan must be reportable per US1). Not registered in app.module yet —
 * wired by T-037 with the rest of US1.
 */
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
