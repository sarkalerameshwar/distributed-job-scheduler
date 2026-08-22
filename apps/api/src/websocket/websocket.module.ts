import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { EventsGateway } from "./events.gateway";

@Module({
  imports: [AuthModule, JwtModule.register({})],
  providers: [EventsGateway],
})
export class WebsocketModule {}
