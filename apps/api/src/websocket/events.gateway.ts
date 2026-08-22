import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { REALTIME_REDIS_CHANNEL, type RealtimeEvent } from "@djs/shared-types";
import { EnvService } from "../config/env.service";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";

type SocketUser = { id: string; email: string };

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: "/realtime",
  path: "/socket.io",
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);
  private subscriber?: Redis;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  afterInit(): void {
    this.subscriber = new Redis({
      host: this.env.redisHost,
      port: this.env.redisPort,
      password: this.env.redisPassword,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    void this.subscriber
      .connect()
      .then(() => this.subscriber!.subscribe(REALTIME_REDIS_CHANNEL))
      .then(() => {
        this.logger.log(`Subscribed to Redis channel ${REALTIME_REDIS_CHANNEL}`);
      })
      .catch((error: unknown) => {
        this.logger.error(
          JSON.stringify({
            msg: "realtime_subscribe_failed",
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      });

    this.subscriber.on("message", (_channel, raw) => {
      try {
        const event = JSON.parse(raw) as RealtimeEvent;
        if (event.organizationId) {
          this.server.to(`org:${event.organizationId}`).emit(event.type, event);
        } else {
          this.server.to("platform").emit(event.type, event);
        }
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            msg: "realtime_message_invalid",
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authenticate(client);
      client.data.user = user;
      await client.join("platform");
      client.emit("realtime.ready", { userId: user.id });
      this.logger.debug(JSON.stringify({ msg: "socket_connected", userId: user.id, sid: client.id }));
    } catch {
      client.emit("realtime.error", { code: "UNAUTHORIZED", message: "Invalid or missing access token" });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(JSON.stringify({ msg: "socket_disconnected", sid: client.id }));
  }

  @SubscribeMessage("subscribe.org")
  async subscribeOrg(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { organizationId?: string },
  ): Promise<{ ok: boolean; organizationId?: string; error?: string }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const organizationId = body?.organizationId;
    if (!organizationId) {
      return { ok: false, error: "ORGANIZATION_REQUIRED" };
    }
    try {
      await this.rbac.assertMembership(user.id, organizationId, "VIEWER");
    } catch {
      return { ok: false, error: "ORGANIZATION_ACCESS_DENIED" };
    }
    await client.join(`org:${organizationId}`);
    return { ok: true, organizationId };
  }

  @SubscribeMessage("unsubscribe.org")
  async unsubscribeOrg(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { organizationId?: string },
  ): Promise<{ ok: boolean }> {
    if (body?.organizationId) {
      await client.leave(`org:${body.organizationId}`);
    }
    return { ok: true };
  }

  private async authenticate(client: Socket): Promise<SocketUser> {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      (typeof client.handshake.headers.authorization === "string"
        ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : undefined);
    if (!raw) {
      throw new Error("missing token");
    }
    const payload = await this.jwt.verifyAsync<{ sub: string; email: string; typ: string }>(raw, {
      secret: this.env.jwtAccessSecret,
    });
    if (payload.typ !== "access") {
      throw new Error("wrong token type");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new Error("user inactive");
    }
    return { id: user.id, email: user.email };
  }
}
