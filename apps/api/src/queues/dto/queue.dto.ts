import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

export class CreateQueueDto {
  @ApiProperty()
  @IsString()
  projectId!: string;

  @ApiProperty({ example: "email" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxConcurrency?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  defaultPriority?: number;

  @ApiProperty()
  @IsString()
  retryPolicyId!: string;
}

export class UpdateQueueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxConcurrency?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  defaultPriority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retryPolicyId?: string;
}

export class ListQueuesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ enum: ["ACTIVE", "PAUSED", "DISABLED"] })
  @IsOptional()
  @IsEnum(["ACTIVE", "PAUSED", "DISABLED"])
  status?: "ACTIVE" | "PAUSED" | "DISABLED";
}
