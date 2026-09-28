import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import appConfig, { aiConfig } from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import minioConfig from './config/minio.config';
import { HealthController } from './common/health.controller';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';

// ─── Phase 2: Authentication ──────────────────────────────────────────────────
import { AuthModule } from './modules/auth/auth.module';

// ─── Phase 3: User Profiles ───────────────────────────────────────────────────
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HelpersModule } from './modules/helpers/helpers.module';

// ─── Phase 4: Services ────────────────────────────────────────────────────────
import { ServicesModule } from './modules/services/services.module';

// ─── Phase 5: Job & Quote System ─────────────────────────────────────────────
import { JobsModule } from './modules/jobs/jobs.module';
// import { QuotesModule } from './modules/quotes/quotes.module';
// import { ContractsModule } from './modules/contracts/contracts.module';

// ─── Phase 6: Job Feed & Matching ────────────────────────────────────────────
import { MatchingModule } from './modules/matching/matching.module';

// ─── Phase 7: Realtime ────────────────────────────────────────────────────────
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';

// ─── Phase 8: Payment & Wallet ────────────────────────────────────────────────
import { PaymentsModule } from './modules/payments/payments.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
// import { WalletModule } from './modules/wallet/wallet.module';

// ─── Phase 9: Admin ───────────────────────────────────────────────────────────
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

// ─── Phase 10: AI Features ────────────────────────────────────────────────────
import { AiModule } from './modules/ai/ai.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
  imports: [
    // Config — global
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, aiConfig, databaseConfig, jwtConfig, redisConfig, minioConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Database — MongoDB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
        dbName: configService.get<string>('database.name'),
      }),
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('app.rateLimitTtl', 60) * 1000,
          limit: configService.get<number>('app.rateLimitMax', 100),
        },
      ],
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    CustomersModule,
    HelpersModule,
    ServicesModule,
    JobsModule,
    NotificationsModule,
    ChatModule,
    PaymentsModule,
    ReviewsModule,
    AdminModule,
    AnalyticsModule,
    AiModule,
    MatchingModule,
    UploadsModule,

    // Phase 4+ (uncomment as implemented)
    // CustomersModule,
    // HelpersModule,
    // ServicesModule,
    // JobsModule,
    // QuotesModule,
    // ContractsModule,
    // MatchingModule,
    // NotificationsModule,
    // ChatModule,
    // PaymentsModule,
    // WalletModule,
    // AdminModule,
    // AnalyticsModule,
  ],
})
export class AppModule {}
