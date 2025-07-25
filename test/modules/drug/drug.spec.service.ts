import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { DrugEntity } from 'src/drug/drug.model';

@Injectable()
export class DrugTestService {
  constructor(private prismaService: PrismaService) {}

  readonly TEST_DRUG_NAME = 'testing_name';
  readonly TEST_DRUG_PRICE = 5_000;
  readonly TEST_DRUG_UNIT = 'testing_unit';
  readonly TEST_DRUG_AMOUNT_SOLD = 100;

  async createTestDrug(): Promise<DrugEntity> {
    const drug = await this.prismaService.drug.create({
      data: {
        name: this.TEST_DRUG_NAME,
        price: this.TEST_DRUG_PRICE,
        unit: this.TEST_DRUG_UNIT,
        amount_sold: this.TEST_DRUG_AMOUNT_SOLD,
      },
    });

    return drug;
  }

  async deleteTestDrug(id: number): Promise<void> {
    await this.prismaService.drug.delete({
      where: { id },
    });
  }
}
