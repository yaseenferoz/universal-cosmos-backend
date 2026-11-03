import { AppError } from '../../utils/errors.js';
import { objectDetail, objectSummary } from './objects.dto.js';
import type { ObjectRepository } from './objects.repository.js';
import type { ListInput } from './objects.schemas.js';

export class ObjectService {
  constructor(private readonly repository: ObjectRepository) {}
  async list(input: ListInput) {
    const { items, total } = await this.repository.list(input);
    return { data: items.map(objectSummary), pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  }
  async getRecord(id: string) {
    const object = await this.repository.findById(id);
    if (!object) throw new AppError(404, 'OBJECT_NOT_FOUND', 'Celestial object not found');
    return object;
  }
  async get(id: string) { return objectDetail(await this.getRecord(id)); }
  async solarSystem() {
    const objects = await this.repository.solarSystem();
    const sun = objects.find(object => object.slug === 'sun');
    if (!sun) throw new AppError(404, 'SOLAR_SYSTEM_NOT_FOUND', 'Solar System catalogue has not been seeded');
    return { name: 'Solar System', rootObjectId: sun.id, objects: objects.map(objectSummary) };
  }
}
