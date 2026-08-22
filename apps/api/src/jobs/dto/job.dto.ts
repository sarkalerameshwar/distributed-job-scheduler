import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { JOB_STATUSES, JOB_TYPES, TASK_TYPES } from "@djs/shared-types";
import { PaginationQueryDto } from "../../common/pagination";

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  queueId!: string;

  @ApiProperty({ example: "Welcome email" })
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  name!: string;

  @ApiProperty({ enum: JOB_TYPES })
  @IsEnum(JOB_TYPES)
  type!: (typeof JOB_TYPES)[number];

  @ApiProperty({ enum: TASK_TYPES, example: "send_email" })
  @IsEnum(TASK_TYPES)
  taskType!: (typeof TASK_TYPES)[number];

  @ApiProperty({ example: { to: "ada@example.com", subject: "Welcome" } })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retryPolicyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: "Required for DELAYED (absolute or use delayMs)" })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: "Delay in ms from now (DELAYED jobs)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  delayMs?: number;

  @ApiPropertyOptional({ description: "Required for RECURRING" })
  @ValidateIf((o: CreateJobDto) => o.type === "RECURRING")
  @IsString()
  @MaxLength(64)
  cronExpression?: string;

  @ApiPropertyOptional({ default: "UTC" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(3_600_000)
  timeoutMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number;
}

export class CreateJobItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  name!: string;

  @ApiProperty({ enum: JOB_TYPES, default: "BATCH" })
  @IsOptional()
  @IsEnum(JOB_TYPES)
  type?: (typeof JOB_TYPES)[number];

  @ApiProperty({ enum: TASK_TYPES })
  @IsEnum(TASK_TYPES)
  taskType!: (typeof TASK_TYPES)[number];

  @ApiProperty()
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retryPolicyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(3_600_000)
  timeoutMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number;
}

export class CreateBatchJobsDto {
  @ApiProperty()
  @IsString()
  queueId!: string;

  @ApiProperty({ type: [CreateJobItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateJobItemDto)
  jobs!: CreateJobItemDto[];
}

export class ListJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queueId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ enum: JOB_STATUSES })
  @IsOptional()
  @IsEnum(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  @ApiPropertyOptional({ enum: TASK_TYPES })
  @IsOptional()
  @IsEnum(TASK_TYPES)
  taskType?: (typeof TASK_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ enum: ["createdAt", "priority", "status"] })
  @IsOptional()
  @IsEnum(["createdAt", "priority", "status"])
  sortBy?: "createdAt" | "priority" | "status";

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsEnum(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}

export class ListJobLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Filter logs to a single execution attempt" })
  @IsOptional()
  @IsString()
  executionId?: string;

  @ApiPropertyOptional({ enum: ["DEBUG", "INFO", "WARN", "ERROR"] })
  @IsOptional()
  @IsEnum(["DEBUG", "INFO", "WARN", "ERROR"])
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR";
}
