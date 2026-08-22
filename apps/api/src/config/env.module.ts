import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./env.validation";
import { EnvService } from "./env.service";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateEnvironment,
    }),
  ],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
