import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { PrismaService } from 'src/common/prisma.service';
import { ValidationService } from 'src/common/validation.service';
import { Logger } from 'winston';

import {
  AddSessionTreatmentDto,
  AddSessionTreatmentResponse,
  AddTreatmentDto,
  AddTreatmentResponse,
  GetAllTreatmentsResponse,
  Treatment,
  UpdateTreatmentDto,
} from './treatment.model';
import { TreatmentValidation } from './treatment.validation';

@Injectable()
export class TreatmentService {
  constructor(
    private validationService: ValidationService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
    private prismaService: PrismaService,
  ) {}

  async add(dto: AddTreatmentDto): Promise<AddTreatmentResponse> {
    this.logger.info(`TreatmentService.add(${JSON.stringify(dto)})`);

    const request = this.validationService.validate<AddTreatmentDto>(
      TreatmentValidation.ADD,
      dto,
    );

    const res = await this.prismaService.treatment.create({
      data: request,
    });

    return res;
  }

  async addSessionTreatments(
    dto: AddSessionTreatmentDto,
  ): Promise<AddSessionTreatmentResponse[]> {
    const request = this.validationService.validate<AddSessionTreatmentDto>(
      TreatmentValidation.ADD_SESSION_TREATMENT,
      dto,
    );

    const treatmentIds = request.treatments.map((t) => t.treatment_id);
    const treatments = await this.prismaService.treatment.findMany({
      where: { id: { in: treatmentIds } },
      select: { id: true, price: true },
    });
    const priceMap = new Map<number, number>();
    treatments.forEach((t) => priceMap.set(t.id, t.price));

    const operations = request.treatments.map(({ treatment_id, quantity }) =>
      this.prismaService.careSessionTreatment.create({
        data: {
          care_session_id: request.care_session_id,
          treatment_id: treatment_id,
          quantity,
          applied_price: priceMap.get(treatment_id) ?? 0,
        },
      }),
    );

    const created = await this.prismaService.$transaction(operations);

    return created.map(
      ({ care_session_id, treatment_id, applied_price, quantity }) => ({
        care_session_id,
        treatment_id,
        applied_price,
        quantity,
      }),
    );
  }

  async getAll(
    page: string,
    search?: string,
    pageSize?: number,
  ): Promise<GetAllTreatmentsResponse> {
    this.logger.info(`TreatmentService.getAll(page=${page}, search=${search})`);

    let pageNumber = parseInt(page) || 1;

    if (pageNumber == 0)
      throw new HttpException('Invalid page data type', HttpStatus.BAD_REQUEST);

    if (pageNumber < 1) pageNumber = 1;

    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : undefined;

    if (!pageSize) {
      const treatments = await this.prismaService.treatment.findMany({
        where: searchFilter,
        orderBy: {
          name: 'asc',
        },
      });

      return {
        data: treatments,
        meta: {
          current_page: 1,
          previous_page: null,
          next_page: null,
          total_page: 1,
          total_data: treatments.length,
        },
      };
    }

    const offset = (pageNumber - 1) * pageSize;

    const [treatments, totalData] = await Promise.all([
      this.prismaService.treatment.findMany({
        skip: offset,
        take: pageSize,
        where: searchFilter,
        orderBy: {
          name: 'asc',
        },
      }),
      this.prismaService.treatment.count({
        where: searchFilter,
      }),
    ]);

    const totalPage = Math.ceil(totalData / pageSize);
    const previousPage = pageNumber > 1 ? pageNumber - 1 : null;
    const nextPage = pageNumber < totalPage ? pageNumber + 1 : null;

    return {
      data: treatments,
      meta: {
        current_page: pageNumber,
        previous_page: previousPage,
        next_page: nextPage,
        total_page: totalPage,
        total_data: totalData,
      },
    };
  }

  async update(id: string, dto: UpdateTreatmentDto): Promise<Treatment> {
    this.logger.info(
      `TreatmentService.update(id=${id}, dto=${JSON.stringify(dto)})`,
    );

    const numericId = parseInt(id);

    if (isNaN(numericId)) {
      throw new HttpException('Invalid ID format', HttpStatus.BAD_REQUEST);
    }

    const request = this.validationService.validate<UpdateTreatmentDto>(
      TreatmentValidation.UPDATE,
      dto,
    );

    try {
      const res = await this.prismaService.treatment.update({
        where: {
          id: numericId,
        },
        data: request,
      });

      return res;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new HttpException(
          'Data penanganan tidak ditemukan!',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  async delete(id: string): Promise<string> {
    this.logger.info(`TreatmentService.delete(${id})`);

    const numericId = parseInt(id);

    if (isNaN(numericId)) {
      throw new HttpException('Invalid ID format', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.prismaService.treatment.delete({
        where: {
          id: numericId,
        },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new HttpException(
          'Data penanganan tidak ditemukan!',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }

    return `Successfully deleted: ${id}`;
  }
}
