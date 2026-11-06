import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@homemate/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // B93: fail-CLOSED — mọi lỗi khi kiểm tra quyền đều chặn (403),
    // chỉ cho qua khi kiểm tra rõ ràng là có quyền.
    try {
      const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const user = request?.user;
      if (!user) return false;

      const roles: unknown = user.roles;
      const activeRole: unknown = user.active_role;
      return requiredRoles.some(
        role =>
          (Array.isArray(roles) && roles.includes(role)) || activeRole === role,
      );
    } catch (err) {
      this.logger.error(
        `RolesGuard check failed (fail-closed): ${(err as Error)?.message ?? err}`,
      );
      return false;
    }
  }
}
