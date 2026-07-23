import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuthUser } from '../common/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { KpisQueryDto, CollectionsQueryDto, AgingQueryDto, CollectorsPerformanceQueryDto, ExportReportDto } from './dto/reports.dto';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('executive/kpis')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'مؤشرات الأداء التنفيذية' })
  kpis(@CurrentUser() user: AuthUser, @Query() query: KpisQueryDto) {
    return this.reports.kpis(user, query);
  }

  @Get('executive/collections-monthly')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'التحصيل الشهري' })
  collections(@CurrentUser() user: AuthUser, @Query() query: CollectionsQueryDto) {
    return this.reports.collections(user, query);
  }

  @Get('executive/debt-by-branch')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'توزيع المديونية حسب الفروع' })
  debtByBranch(@CurrentUser() user: AuthUser) {
    return this.reports.debtByBranch(user);
  }

  @Get('executive/customers-collection-state')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'توزيع العملاء حسب حالة التحصيل' })
  customersState(@CurrentUser() user: AuthUser) {
    return this.reports.customersCollectionState(user);
  }

  @Get('executive/aging')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'تقرير أعمار الديون' })
  aging(@CurrentUser() user: AuthUser, @Query() query: AgingQueryDto) {
    return this.reports.aging(user, query);
  }

  @Get('executive/top-collectors')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'أفضل 10 محصلين حسب إجمالي التحصيل' })
  collectors(@CurrentUser() user: AuthUser, @Query() query: CollectorsPerformanceQueryDto) {
    return this.reports.collectorsPerformance(user, query);
  }

  @Post('export')
  @RequirePermissions('reports.export')
  @ApiOperation({ summary: 'تصدير تقرير (PDF/Excel) — Placeholder' })
  export(@CurrentUser() user: AuthUser, @Body() body: ExportReportDto) {
    return this.reports.export(user, body);
  }
}
