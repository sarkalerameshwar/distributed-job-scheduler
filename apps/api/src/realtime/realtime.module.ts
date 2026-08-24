import { Global, Module } from "@nestjs/common";
import { RealtimePublisher } from "./realtime.publisher";
import { DispatchWakePublisher } from "./dispatch-wake.publisher";

@Global()
@Module({
  providers: [RealtimePublisher, DispatchWakePublisher],
  exports: [RealtimePublisher, DispatchWakePublisher],
})
export class RealtimeModule {}
