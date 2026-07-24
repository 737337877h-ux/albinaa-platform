import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class BaseExportDto {
  @ApiProperty({ enum: ['xlsx', 'pdf'] })
  @IsIn(['xlsx', 'pdf'])
  format!: 'xlsx' | 'pdf';

  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  customerStatus?: 'active' | 'inactive' | 'all';
}

export class ExportExecutiveDto extends BaseExportDto {
  @ApiProperty({ enum: ['executive'] })
  @IsIn(['executive'])
  report!: 'executive';
}

export class ExportAgingDto extends BaseExportDto {
  @ApiProperty({ enum: ['aging'] })
  @IsIn(['aging'])
  report!: 'aging';

  @ApiPropertyOptional({ description: 'معرف المحصل' })
  @IsOptional()
  @IsUUID()
  collectorId?: string;
}

export class ExportAgingDetailDto extends BaseExportDto {
  @ApiProperty({ enum: ['aging-detail'] })
  @IsIn(['aging-detail'])
  report!: 'aging-detail';

  @ApiPropertyOptional({ description: 'معرف المحصل' })
  @IsOptional()
  @IsUUID()
  collectorId?: string;

  @ApiPropertyOptional({ enum: ['current', '1-30', '31-60', '61-90', '90+'], description: 'فلتر فئة أعمار الديون' })
  @IsOptional()
  @IsIn(['current', '1-30', '31-60', '61-90', '90+'])
  bucket?: string;

  @ApiPropertyOptional({ description: 'صفحة النتائج', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  page?: number;

  @ApiPropertyOptional({ description: 'عدد العناصر لكل صفحة', default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ExportCollectorsDto extends BaseExportDto {
  @ApiProperty({ enum: ['collectors'] })
  @IsIn(['collectors'])
  report!: 'collectors';

  @ApiPropertyOptional({ description: 'معرف المحصل' })
  @IsOptional()
  @IsUUID()
  collectorId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active', description: 'حالة المحصل' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  collectorStatus?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ enum: ['collector_name', 'customers', 'today', 'week', 'month', 'collections_count', 'outstanding_balance', 'fulfillment_rate', 'collection_rate'], default: 'month' })
  @IsOptional()
  @IsIn(['collector_name', 'customers', 'today', 'week', 'month', 'collections_count', 'outstanding_balance', 'fulfillment_rate', 'collection_rate'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export const EXPORT_REPORTS = ['executive', 'aging', 'aging-detail', 'collectors'] as const;
export type ExportReportType = (typeof EXPORT_REPORTS)[number];

export type ExportDto = ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto;

const MAX_ROWS: Record<ExportReportType, number> = {
  executive: 50000,
  aging: 50000,
  'aging-detail': 50000,
  collectors: 50000,
};

export const MAX_EXPORT_ROWS = 50_000;
export const STREAMING_THRESHOLD = 10_000;
