import { Module } from '@nestjs/common';
import { ScansRepository } from '../scans/scans.repository';
import { MisidentificationReportsController } from './misidentification-reports.controller';
import { MisidentificationReportsService } from './misidentification-reports.service';
import { MisidentificationReportsRepository } from './misidentification-reports.repository';

/**
 * US1/US9 misidentification-report write side (FR-025). Depends on
 * `ScansRepository` (T-020) directly rather than importing the whole
 * `ScansModule` — `ScansRepository` has no constructor dependencies of its own,
 * and this module only needs read-only scan lookups, not the scan submission
 * pipeline (storage/AI/credits/queue). NOT imported by app.module here —
 * T-037 registers it once the rest of US1 exists.
 */
@Module({
  controllers: [MisidentificationReportsController],
  providers: [MisidentificationReportsService, MisidentificationReportsRepository, ScansRepository],
})
export class MisidentificationReportsModule {}
