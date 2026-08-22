import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateWorkerEnvironment } from "./env.validation";
import { EnvService } from "./env.service";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateWorkerEnvironment,
    }),
  ],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
