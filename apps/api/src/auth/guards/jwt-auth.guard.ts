import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") implements CanActivate {
  override handleRequest<TUser>(err: Error | undefined, user: TUser): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }

  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
