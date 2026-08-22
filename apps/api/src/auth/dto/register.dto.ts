import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: "Admin123!Dev", minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: "Ada Lovelace" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;
}
