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

export class AgingQueryDto extends ReportFiltersDto {}

export class CollectorsPerformanceQueryDto extends ReportFiltersDto {
  @ApiPropertyOptional({ description: 'صفحة النتائج', default: 1 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  page?: number;

  @ApiPropertyOptional({ description: 'عدد العناصر لكل صفحة', default: 25, maximum: 100 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['collector_name', 'customers', 'today', 'week', 'month', 'collections_count', 'outstanding_balance', 'fulfillment_rate', 'collection_rate'], default: 'month' })
  @IsOptional() @IsIn(['collector_name', 'customers', 'today', 'week', 'month', 'collections_count', 'outstanding_balance', 'fulfillment_rate', 'collection_rate'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active', description: 'حالة المحصل' })
  @IsOptional() @IsIn(['active', 'inactive', 'all'])
  collectorStatus?: 'active' | 'inactive' | 'all';
}

export class AgingDetailQueryDto extends ReportFiltersDto {
  @ApiPropertyOptional({ description: 'صفحة النتائج', default: 1 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  page?: number;

  @ApiPropertyOptional({ description: 'عدد العناصر لكل صفحة', default: 25, maximum: 100 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['customer_name', 'customer_code', 'branch', 'collector', 'currency', 'total_balance', 'current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'oldest_debt_date', 'days_overdue'], default: 'total_balance' })
  @IsOptional() @IsIn(['customer_name', 'customer_code', 'branch', 'collector', 'currency', 'total_balance', 'current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'oldest_debt_date', 'days_overdue'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: ['current', '1-30', '31-60', '61-90', '90+'], description: 'فلتر فئة أعمار الديون' })
  @IsOptional() @IsIn(['current', '1-30', '31-60', '61-90', '90+'])
  bucket?: string;
}

export class UnfollowedQueryDto extends ReportFiltersDto {
  @ApiPropertyOptional({ description: 'صفحة النتائج', default: 1 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  page?: number;

  @ApiPropertyOptional({ description: 'عدد العناصر لكل صفحة', default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @Min(1) @Max(100)
  limit?: number;
}

export class DebtByBranchQueryDto extends ReportFiltersDto {}

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
