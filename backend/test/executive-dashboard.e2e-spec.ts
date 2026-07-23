import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN = { username: 'admin', password: process.env.ADMIN_INITIAL_PASSWORD ?? 'ChangeMe!2026' };

describe('Executive Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let collectorToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const adminLogin = await request(app.getHttpServer()).post('/auth/login').send(ADMIN).expect(200);
    adminToken = adminLogin.body.accessToken;

    // Create collector user without executive permission for RBAC check
    const uniq = Date.now().toString(36);
    const collectorUser = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: `exec_collector_${uniq}`, fullName: 'محصل تجريبي', password: 'Test1234pass' })
      .expect(201);
    const collectorRole = await prisma.role.findFirstOrThrow({ where: { name: 'المحصل' } });
    await request(app.getHttpServer())
      .post(`/users/${collectorUser.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [collectorRole.id] })
      .expect(201);
    await prisma.collector.create({ data: { userId: collectorUser.body.id } });
    const collectorLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `exec_collector_${uniq}`, password: 'Test1234pass' })
      .expect(200);
    collectorToken = collectorLogin.body.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /reports/executive/kpis returns KPIs for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/executive/kpis')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('totalCustomers');
    expect(res.body).toHaveProperty('collectionRate');
  });

  it('GET /reports/executive/collections-monthly returns series', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/executive/collections-monthly')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('RBAC: collector without reports.executive gets 403', async () => {
    await request(app.getHttpServer())
      .get('/reports/executive/kpis')
      .set('Authorization', `Bearer ${collectorToken}`)
      .expect(403);
  });
});
