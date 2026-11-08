import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService, Otp, OtpSchema } from './otp.service';
import { MailService } from './mail.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtAuthOptionalGuard } from './guards/jwt-optional.guard';
import { UsersModule } from '../users/users.module';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Dynamic config via AuthService.generateTokens
    MongooseModule.forFeature([
      { name: Otp.name, schema: OtpSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
    ]),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    MailService,
    JwtStrategy,
    JwtAuthGuard,
    JwtAuthOptionalGuard,
  ],
  exports: [AuthService, OtpService, MailService, JwtAuthGuard, JwtAuthOptionalGuard, JwtStrategy],
})
export class AuthModule {}
