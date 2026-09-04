import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerProfile, CustomerProfileSchema } from './schemas/customer-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerProfile.name, schema: CustomerProfileSchema }]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
