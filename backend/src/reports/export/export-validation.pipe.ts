import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ExportExecutiveDto,
  ExportAgingDto,
  ExportAgingDetailDto,
  ExportCollectorsDto,
} from '../dto/export.dto';

const DTO_MAP: Record<string, new () => object> = {
  executive: ExportExecutiveDto,
  aging: ExportAgingDto,
  'aging-detail': ExportAgingDetailDto,
  collectors: ExportCollectorsDto,
};

@Injectable()
export class ExportValidationPipe implements PipeTransform {
  async transform(body: Record<string, unknown>) {
    if (!body || typeof body.report !== 'string') {
      throw new BadRequestException('حقل report مطلوب');
    }
    if (!body.format || body.format !== 'xlsx') {
      throw new BadRequestException('حقل format يجب أن يكون xlsx');
    }

    const DtoClass = DTO_MAP[body.report];
    if (!DtoClass) {
      throw new BadRequestException(
        `نوع التقرير "${body.report}" غير مدعوم. الأنواع المدعومة: ${Object.keys(DTO_MAP).join(', ')}`,
      );
    }

    const dto = plainToInstance(DtoClass, body, { excludeExtraneousValues: false });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) =>
        Object.values(e.constraints ?? {}),
      );
      throw new BadRequestException(
        messages.length > 0 ? messages.join('، ') : 'البيانات غير صحيحة',
      );
    }

    return dto;
  }
}
