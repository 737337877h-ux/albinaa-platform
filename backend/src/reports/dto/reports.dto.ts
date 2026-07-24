import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ReportFiltersDto {
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

  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional() @IsIn(['active', 'inactive', 'all'])
  customerStatus?: 'active' | 'inactive' | 'all';
}

export class CollectionsQueryDto extends ReportFiltersDto {
  @ApiPropertyOptional({ enum: ['day', 'week', 'month'], default: 'month' })
  @IsOptional() @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';
}

export class AgingQueryDto {
  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217', default: 'USD' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional() @IsUUID()
  branchId?: string;
}

export class CollectorsPerformanceQueryDto {
  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'صفحة النتائج', default: 1 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  page?: number;

  @ApiPropertyOptional({ description: 'عدد العناصر لكل صفحة', default: 25, maximum: 100 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  limit?: number;
}

export class ExportReportDto {
  @ApiPropertyOptional({ enum: ['kpis', 'collections', 'aging', 'collectors', 'promises', 'followups'], default: 'kpis' })
  @IsOptional()
  @IsIn(['kpis', 'collections', 'aging', 'collectors', 'promises', 'followups'])
  report!: string;

  @ApiPropertyOptional({ enum: ['pdf', 'xlsx'], default: 'pdf' })
  @IsOptional() @IsIn(['pdf', 'xlsx'])
  format?: 'pdf' | 'xlsx';

  @ApiPropertyOptional({ description: 'معلمات إضافية للتقرير' })
  @IsOptional()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'اسم الملف المطلوب بدون الامتداد' })
  @IsOptional() @IsString() @IsNotEmpty()
  fileName?: string;
}
