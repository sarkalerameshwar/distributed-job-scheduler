-- CreateTable
CREATE TABLE `schema_meta` (
    `id` VARCHAR(191) NOT NULL,
    `phase` VARCHAR(64) NOT NULL,
    `description` VARCHAR(512) NOT NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
