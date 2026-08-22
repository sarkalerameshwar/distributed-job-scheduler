import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

export class ListWorkersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ["STARTING", "ONLINE", "DRAINING", "OFFLINE", "FAILED"] })
  @IsOptional()
  @IsString()
  @IsIn(["STARTING", "ONLINE", "DRAINING", "OFFLINE", "FAILED"])
  status?: string;
}
