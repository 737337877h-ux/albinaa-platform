import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export const EXPORT_REPORTS = ['executive', 'aging', 'aging-detail', 'collectors'] as const;
export type ExportReportType = (typeof EXPORT_REPORTS)[number];
export const MAX_EXPORT_ROWS = 50_000;

/* ---------- Per-report DTO classes (each is self-contained) ---------- */

export class ExportExecutiveDto {
  @ApiProperty({ enum: ['executive'] })
  @IsIn(['executive'])
  report!: 'executive';

  @ApiProperty({ enum: ['xlsx'] })
  @IsIn(['xlsx'])
  format!: 'xlsx';

  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional() @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional() @IsIn(['active', 'inactive', 'all'])
  customerStatus?: 'active' | 'inactive' | 'all';
}

export class ExportAgingDto {
  @ApiProperty({ enum: ['aging'] })
  @IsIn(['aging'])
  report!: 'aging';

  @ApiProperty({ enum: ['xlsx'] })
  @IsIn(['xlsx'])
  format!: 'xlsx';

  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional() @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional() @IsIn(['active', 'inactive', 'all'])
  customerStatus?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ description: 'معرف المحصل' })
  @IsOptional() @IsUUID()
  collectorId?: string;
}

export class ExportAgingDetailDto {
  @ApiProperty({ enum: ['aging-detail'] })
  @IsIn(['aging-detail'])
  report!: 'aging-detail';

  @ApiProperty({ enum: ['xlsx'] })
  @IsIn(['xlsx'])
  format!: 'xlsx';

  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional() @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional() @IsIn(['active', 'inactive', 'all'])
  customerStatus?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ description: 'معرف المحصل' })
  @IsOptional() @IsUUID()
  collectorId?: string;

  @ApiPropertyOptional({ enum: ['current', '1-30', '31-60', '61-90', '90+'], description: 'فلتر فئة أعمار الديون' })
  @IsOptional() @IsIn(['current', '1-30', '31-60', '61-90', '90+'])
  bucket?: string;
}

export class ExportCollectorsDto {
  @ApiProperty({ enum: ['collectors'] })
  @IsIn(['collectors'])
  report!: 'collectors';

  @ApiProperty({ enum: ['xlsx'] })
  @IsIn(['xlsx'])
  format!: 'xlsx';

  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional() @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'معرف المحصل' })
  @IsOptional() @IsUUID()
  collectorId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active', description: 'حالة المحصل' })
  @IsOptional() @IsIn(['active', 'inactive', 'all'])
  collectorStatus?: 'active' | 'inactive' | 'all';
}

export type ExportDto = ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto;
