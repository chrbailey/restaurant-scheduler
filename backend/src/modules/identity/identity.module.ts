import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { WorkerProfilesController } from './controllers/worker-profiles.controller';
import { RestaurantsController } from './controllers/restaurants.controller';

import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { WorkerProfilesService } from './services/worker-profiles.service';
import { RestaurantsService } from './services/restaurants.service';
import { OtpService } from './services/otp.service';

import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwt.secret') || 'default-secret-change-in-production',
        signOptions: {
          expiresIn: configService.get<string>('auth.jwt.accessTokenExpiry', '15m') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    WorkerProfilesController,
    RestaurantsController,
  ],
  providers: [
    AuthService,
    UsersService,
    WorkerProfilesService,
    RestaurantsService,
    OtpService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    UsersService,
    WorkerProfilesService,
    RestaurantsService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class IdentityModule {}
