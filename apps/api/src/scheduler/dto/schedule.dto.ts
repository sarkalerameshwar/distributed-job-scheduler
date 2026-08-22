import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

export class ListSchedulesQueryDto extends PaginationQueryDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queueId?: string;

  @ApiPropertyOptional({ description: "Filter by schedule active flag" })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: ["DELAY", "CRON", "ONE_TIME"] })
  @IsOptional()
  @IsString()
  scheduleType?: "DELAY" | "CRON" | "ONE_TIME";
}

export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: "0 9 * * *" })
  @IsOptional()
  @IsString()
  @MinLength(5)
  cronExpression?: string;

  @ApiPropertyOptional({ example: "UTC" })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class PreviewCronDto {
  @ApiProperty({ example: "*/15 * * * *" })
  @IsString()
  @MinLength(5)
  cronExpression!: string;

  @ApiPropertyOptional({ default: "UTC" })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ default: 5, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;

  @ApiPropertyOptional({ description: "ISO timestamp; defaults to now" })
  @IsOptional()
  @IsString()
  from?: string;
}
