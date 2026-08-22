import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";
import { SLUG_PATTERN } from "../../common/slug";

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiProperty({ example: "Notifications" })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ example: "notifications" })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(128)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({ enum: ["ACTIVE", "ARCHIVED"] })
  @IsOptional()
  @IsEnum(["ACTIVE", "ARCHIVED"])
  status?: "ACTIVE" | "ARCHIVED";
}

export class ListProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ enum: ["ACTIVE", "ARCHIVED"] })
  @IsOptional()
  @IsEnum(["ACTIVE", "ARCHIVED"])
  status?: "ACTIVE" | "ARCHIVED";
}
