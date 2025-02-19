import { MailerService } from '@nestjs-modules/mailer';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EmployeeRole, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { PrismaService } from 'src/common/prisma.service';
import { ValidationService } from 'src/common/validation.service';
import {
  AddEmployeeDto,
  AddEmployeeRequest,
  AddEmployeeResponse,
  EmployeeDetail,
  GetAllEmployeeResponse,
  UpdateEmployeeDto,
} from 'src/employee/employee.model';
import { v4 as uuid } from 'uuid';
import { Logger } from 'winston';
import { EmployeeValidation } from './employee.validation';

@Injectable()
export class EmployeeService {
  constructor(
    private validationService: ValidationService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
    private prismaService: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  async generateNip(role: EmployeeRole): Promise<string> {
    const roleValues = Object.values(EmployeeRole);

    const roleIndex = roleValues.indexOf(role);
    if (roleIndex === -1) {
      throw new Error(`Invalid role: ${role}`);
    }

    const roleCode = (roleIndex + 1).toString().padStart(2, '0');

    const year = new Date().getFullYear().toString().slice(-2);

    const sequence = (await this.prismaService.employee.count()) + 1;

    const paddedSequence = sequence.toString().padStart(4, '0');

    return `${year}${roleCode}${paddedSequence}`;
  }

  generatePassword(role: EmployeeRole, nip: string): string {
    const roleMap = {
      ADMIN: 'ADM',
      DOKTER: 'DKT',
      PERAWAT: 'PRW',
      BIDAN: 'BDN',
      FARMASI: 'FRM',
      APOTEKER: 'APT',
      STAFF: 'STF',
    };

    const roleCode = roleMap[role].split('').reverse().join('') || 'USR';

    const nipSuffix = nip.slice(-4).split('').reverse().join('');

    const specialChars = ['!', '@', '#', '$', '%', '*', '?'];
    const specialChar =
      specialChars[Math.floor(Math.random() * specialChars.length)];

    return `${roleCode}${nipSuffix}${specialChar}`;
  }

  async add(dto: AddEmployeeDto): Promise<AddEmployeeResponse> {
    this.logger.info(`EmployeeService.add(${JSON.stringify(dto)})`);

    const generatedId = uuid();
    const generatedNip = await this.generateNip(dto.role);
    const generatedPassword = this.generatePassword(dto.role, generatedNip);

    const addEmployeeRequest =
      this.validationService.validate<AddEmployeeRequest>(
        EmployeeValidation.ADD,
        {
          ...dto,
          id: generatedId,
          nip: generatedNip,
          password: generatedPassword,
        },
      );

    const totalWithSameEmail = await this.prismaService.employee.count({
      where: {
        email: dto.email,
      },
    });

    if (totalWithSameEmail != 0) {
      throw new HttpException(
        `Email ${dto.email} sudah terdaftar!`,
        HttpStatus.BAD_REQUEST,
      );
    }

    addEmployeeRequest.password = await bcrypt.hash(
      addEmployeeRequest.password,
      10,
    );

    const employee = await this.prismaService.employee.create({
      data: addEmployeeRequest,
    });

    const html = `
      <p>Halo <strong>${employee.name}</strong>,</p>
      <p>Selamat bergabung di tim kami! Berikut adalah detail akun Anda:</p>
      <ul>
        <li><strong>NIP:</strong> ${employee.nip}</li>
        <li><strong>Password:</strong> ${generatedPassword}</li>
      </ul>
      <p>Kalau ada pertanyaan atau butuh bantuan, jangan ragu untuk menghubungi tim IT kami.</p>
      <p>Selamat bekerja dan semoga sukses!</p>
      <br>
      <p>Salam,</p>
      <p><strong>Klinik Pratama Millenium</strong></p>
    `;

    try {
      await this.mailerService.sendMail({
        to: employee.email,
        subject: 'Informasi Akun MFlow Anda',
        html,
      });
    } catch (error) {
      this.logger.error(`Mailer error: ${error}`);
    }

    return {
      user: {
        id: employee.id,
        nip: employee.nip,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        role: employee.role,
      },
      token: employee.token,
    };
  }

  async getAll(
    page: string,
    search?: string,
    pageSize?: number,
  ): Promise<GetAllEmployeeResponse> {
    this.logger.info(`EmployeeService.getAll(page=${page}, search=${search})`);

    let pageNumber = parseInt(page) || 1;

    if (pageNumber == 0)
      throw new HttpException('Invalid page data type', HttpStatus.BAD_REQUEST);

    if (pageNumber < 1) pageNumber = 1;

    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { phone: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { nip: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : undefined;

    if (!pageSize) {
      const employees = await this.prismaService.employee.findMany({
        where: searchFilter,
        orderBy: {
          name: 'asc',
        },
      });

      return {
        data: employees.map(({ id, nip, name, email, phone, role }) => ({
          id,
          nip,
          name,
          email,
          phone,
          role,
        })),
        meta: {
          current_page: 1,
          previous_page: null,
          next_page: null,
          total_page: 1,
          total_data: employees.length,
        },
      };
    }

    const offset = (pageNumber - 1) * pageSize;

    const [employees, totalData] = await Promise.all([
      this.prismaService.employee.findMany({
        skip: offset,
        take: pageSize,
        where: searchFilter,
        orderBy: {
          name: 'asc',
        },
      }),
      this.prismaService.employee.count({
        where: searchFilter,
      }),
    ]);

    const totalPage = Math.ceil(totalData / pageSize);
    const previousPage = pageNumber > 1 ? pageNumber - 1 : null;
    const nextPage = pageNumber < totalPage ? pageNumber + 1 : null;

    return {
      data: employees.map(({ id, nip, name, email, phone, role }) => ({
        id,
        nip,
        name,
        email,
        phone,
        role,
      })),
      meta: {
        current_page: pageNumber,
        previous_page: previousPage,
        next_page: nextPage,
        total_page: totalPage,
        total_data: totalData,
      },
    };
  }

  async getById(id: string): Promise<EmployeeDetail> {
    this.logger.info(`EmployeeService.getById(${id})`);

    const employeeData = await this.prismaService.employee.findUnique({
      where: {
        id: id,
      },
    });

    if (!employeeData)
      throw new HttpException(
        'Data karyawan tidak ditemukan!',
        HttpStatus.NOT_FOUND,
      );

    return {
      id: employeeData.id,
      nip: employeeData.nip,
      name: employeeData.name,
      email: employeeData.email,
      phone: employeeData.phone,
      role: employeeData.role,
    };
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeDetail> {
    this.logger.info(
      `EmployeeService.update(id=${id}, dto=${JSON.stringify(dto)})`,
    );

    const request = this.validationService.validate<UpdateEmployeeDto>(
      EmployeeValidation.UPDATE,
      dto,
    );

    try {
      const employee = await this.prismaService.employee.update({
        where: {
          id: id,
        },
        data: request,
      });

      return {
        id: employee.id,
        nip: employee.nip,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        role: employee.role,
      };
    } catch (error) {
      if (error.code === 'P2025') {
        throw new HttpException(
          'Data karyawan tidak ditemukan!',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  async delete(id: string): Promise<string> {
    this.logger.info(`EmployeeService.delete(${id})`);

    try {
      await this.prismaService.employee.delete({
        where: {
          id: id,
        },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new HttpException(
          'Data karyawan tidak ditemukan!',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }

    return `Successfully deleted: ${id}`;
  }
}
