-- LINE 預約設定：開放項目＋時長、時段設定

CREATE TABLE "line_booking_items" (
    "id" SERIAL NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "line_booking_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "line_booking_items_service_item_id_key" ON "line_booking_items"("service_item_id");
ALTER TABLE "line_booking_items" ADD CONSTRAINT "line_booking_items_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "line_settings" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "default_duration_min" INTEGER NOT NULL DEFAULT 60,
    "first_slot" TEXT NOT NULL DEFAULT '10:00',
    "last_slot" TEXT NOT NULL DEFAULT '19:30',
    "slot_interval_min" INTEGER NOT NULL DEFAULT 30,
    CONSTRAINT "line_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "line_settings_store_id_key" ON "line_settings"("store_id");
