import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class KpisQueryDto {
  @ApiPropertyOptional({ enum: ['today', 'week', 'month', 'custom'], default: 'today' })
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'custom'])
  range?: 'today' | 'week' | 'month' | 'custom';

  @ApiPropertyOptional({ description: 'مطلوب عند range=custom (ISO Date)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'مطلوب عند range=custom (ISO Date)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CollectionsQueryDto {
  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month'], default: 'day' })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';

  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class AgingQueryDto {
  @ApiPropertyOptional({ description: 'رمز العملة ISO 4217', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CollectorsPerformanceQueryDto {
  @ApiPropertyOptional({ description: 'من تاريخ (ISO Date)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'إلى تاريخ (ISO Date)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'صفحة النتائج', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'عدد العناصر لكل صفحة', default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ExportReportDto {
  @ApiPropertyOptional({ enum: ['kpis', 'collections', 'aging', 'collectors'], default: 'kpis' })
  @IsOptional()
  @IsIn(['kpis', 'collections', 'aging', 'collectors'])
  report!: 'kpis' | 'collections' | 'aging' | 'collectors';

  @ApiPropertyOptional({ enum: ['pdf', 'xlsx'], default: 'pdf' })
  @IsOptional()
  @IsIn(['pdf', 'xlsx'])
  format?: 'pdf' | 'xlsx';

  @ApiPropertyOptional({ description: 'معلمات إضافية للتقرير' })
  @IsOptional()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'اسم الملف المطلوب بدون الامتداد' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fileName?: string;
}
