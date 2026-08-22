import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateIf } from "class-validator";

export class CreateRetryPolicyDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: ["FIXED", "LINEAR", "EXPONENTIAL"] })
  @IsEnum(["FIXED", "LINEAR", "EXPONENTIAL"])
  strategy!: "FIXED" | "LINEAR" | "EXPONENTIAL";

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxAttempts!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialDelayMs!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDelayMs!: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  multiplier?: number;
}

export class UpdateRetryPolicyDto extends PartialType(
  OmitType(CreateRetryPolicyDto, ["organizationId"] as const),
) {}

export class ListRetryPoliciesQueryDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;
}

export class PreviewRetryPolicyDto {
  @ApiPropertyOptional({ description: "When set, parameters are loaded from this policy" })
  @IsOptional()
  @IsString()
  policyId?: string;

  @ValidateIf((o: PreviewRetryPolicyDto) => !o.policyId)
  @IsEnum(["FIXED", "LINEAR", "EXPONENTIAL"])
  strategy?: "FIXED" | "LINEAR" | "EXPONENTIAL";

  @ValidateIf((o: PreviewRetryPolicyDto) => !o.policyId)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxAttempts?: number;

  @ValidateIf((o: PreviewRetryPolicyDto) => !o.policyId)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialDelayMs?: number;

  @ValidateIf((o: PreviewRetryPolicyDto) => !o.policyId)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDelayMs?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  multiplier?: number;

  @ApiPropertyOptional({ description: "Jitter ratio 0..1 (preview uses RNG=0.5)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  jitterRatio?: number;

  @ApiPropertyOptional({ description: "Also return delay after this failed attempt" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attempt?: number;
}
