import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { SLUG_PATTERN } from "../../common/slug";

export class CreateOrganizationDto {
  @ApiProperty({ example: "Acme Corp" })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ example: "acme" })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(128)
  slug?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(128)
  slug?: string;
}
