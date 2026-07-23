import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EXECUTIVE_PERMISSION = {
  code: 'reports.executive',
  descriptionAr: 'عرض لوحة التقارير التنفيذية',
};

const EXECUTIVE_ROLES = ['مدير النظام', 'مدير المديونية'];

@Injectable()
export class ReportsInitService implements OnModuleInit {
  private readonly logger = new Logger(ReportsInitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const permission = await this.prisma.permission.upsert({
        where: { code: EXECUTIVE_PERMISSION.code },
        update: { descriptionAr: EXECUTIVE_PERMISSION.descriptionAr },
        create: EXECUTIVE_PERMISSION,
      });

      const roles = await this.prisma.role.findMany({
        where: { name: { in: EXECUTIVE_ROLES } },
        select: { id: true, name: true },
      });

      await Promise.all(roles.map((role) => this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })));
    } catch (err) {
      this.logger.error('Failed to ensure executive reports permission', err instanceof Error ? err.stack : err);
    }
  }
}
