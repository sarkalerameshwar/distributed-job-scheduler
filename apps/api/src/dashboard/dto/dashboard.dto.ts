import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class DashboardQueryDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;
}
