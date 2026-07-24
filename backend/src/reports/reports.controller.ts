import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuthUser } from '../common/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { ExportService } from './export/export.service';
import {
  AgingDetailQueryDto,
  AgingQueryDto,
  CollectionsQueryDto,
  CollectorsPerformanceQueryDto,
  DebtByBranchQueryDto,
  ReportFiltersDto,
  UnfollowedQueryDto,
} from './dto/reports.dto';
import {
  ExportExecutiveDto,
  ExportAgingDto,
  ExportAgingDetailDto,
  ExportCollectorsDto,
  ExportDto,
} from './dto/export.dto';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('executive/kpis')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'مؤشرات الأداء التنفيذية' })
  kpis(@CurrentUser() user: AuthUser, @Query() query: ReportFiltersDto) {
    return this.reports.kpis(user, query);
  }

  @Get('executive/collections-monthly')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'التحصيل حسب الفترة' })
  collections(@CurrentUser() user: AuthUser, @Query() query: CollectionsQueryDto) {
    return this.reports.collections(user, query);
  }

  @Get('executive/debt-by-branch')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'توزيع المديونية حسب الفروع' })
  debtByBranch(@CurrentUser() user: AuthUser, @Query() query: DebtByBranchQueryDto) {
    return this.reports.debtByBranch(user, query);
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

  @Get('executive/aging-detail')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'تفصيل أعمار الديون (حسب العميل)' })
  agingDetail(@CurrentUser() user: AuthUser, @Query() query: AgingDetailQueryDto) {
    return this.reports.agingDetail(user, query);
  }

  @Get('executive/top-collectors')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'أداء المحصلين' })
  collectors(@CurrentUser() user: AuthUser, @Query() query: CollectorsPerformanceQueryDto) {
    return this.reports.collectorsPerformance(user, query);
  }

  @Get('executive/collections-by-method')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'التحصيل حسب طريقة الدفع' })
  collectionsByMethod(@CurrentUser() user: AuthUser, @Query() query: ReportFiltersDto) {
    return this.reports.collectionsByMethod(user, query);
  }

  @Get('executive/promises-by-status')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'الوعود حسب الحالة' })
  promisesByStatus(@CurrentUser() user: AuthUser, @Query() query: ReportFiltersDto) {
    return this.reports.promisesByStatus(user, query);
  }

  @Get('executive/followups-summary')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'ملخص المتابعات' })
  followupsSummary(@CurrentUser() user: AuthUser, @Query() query: ReportFiltersDto) {
    return this.reports.followupsSummary(user, query);
  }

  @Get('executive/unfollowed-customers')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'عملاء بدون متابعة (مع pagination)' })
  unfollowedCustomers(@CurrentUser() user: AuthUser, @Query() query: UnfollowedQueryDto) {
    return this.reports.unfollowedCustomers(user, query);
  }

  @Get('collectors')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'قائمة المحصلين (للفلاتر)' })
  collectorsList(@CurrentUser() user: AuthUser) {
    return this.reports.collectorsList(user);
  }

  @Post('export')
  @RequirePermissions('reports.executive')
  @ApiOperation({ summary: 'تصدير تقرير Excel' })
  async exportReport(
    @CurrentUser() user: AuthUser,
    @Body() body: ExportDto,
    @Res() res: Response,
  ) {
    return this.exportService.exportToExcel(user, body, res);
  }
}
