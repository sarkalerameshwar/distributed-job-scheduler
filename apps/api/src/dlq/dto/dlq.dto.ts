import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

export class ListDlqQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    description: "true = only resolved, false = only open, omit = all",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  })
  @IsBoolean()
  resolved?: boolean;
}

export class ResolveDlqDto {
  @ApiPropertyOptional({ description: "Optional operator note stored in a job log" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}
