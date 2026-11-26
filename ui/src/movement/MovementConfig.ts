import { CELL_SIZE } from '../constants';

/**
 * Thông số di chuyển kiểu Red Alert 2 (chỉnh ở đây để thay đổi cảm giác di chuyển).
 * Áp dụng cho cả người chơi lẫn AI.
 *
 * Những thông số cũ vẫn nằm ở chỗ cũ: tốc độ / bán kính từng loại (constants.ts VEHICLE_BASE…), tốc độ quay
 * (Unit.turnRate, Vehicle), góc phải quay tại chỗ (Unit.ts PIVOT_ANGLE), thời gian chờ ngã tư (CROSSING_*),
 * nhường đường cho xe đứng yên (Game.giveWay), tìm lại đường khi kẹt (REPATH_*).
 */

// ---- Giữ ô (mỗi ô tối đa 1 xe) ----

/** Giây một xe giữ chỗ ô kế tiếp nó sắp lăn vào (gia hạn mỗi tick nó còn muốn vào). */
export const CELL_RESERVE_SECONDS = 0.4;
/** Chờ ô kế tiếp bị xe khác giữ quá chừng này giây thì xử lý tắc: xe đứng yên cùng phe tự dạt ra, hai xe đâm đầu nhau thì một xe né. */
export const CELL_WAIT_RESOLVE = 0.6;
/** Giây giữa hai lần chạy bộ gỡ tắc (không chạy mỗi tick). */
export const CELL_RESOLVE_PERIOD = 0.25;
/** Tối đa số xe được bảo né mỗi lượt gỡ tắc (tránh dồn việc vào một tick). */
export const CELL_RESOLVE_PER_PASS = 8;

// ---- Ô con của bộ binh (như RA2: 5 chỗ đứng trong 1 ô) ----

/** Khoảng lệch (world px) của 4 chỗ góc so với tâm ô; chỗ thứ 5 là tâm. */
export const SUBCELL_OFFSET = CELL_SIZE / 4;
/** 5 chỗ đứng trong một ô (dx, dy so với tâm ô): tâm trước, rồi 4 góc. */
export const SUBCELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-SUBCELL_OFFSET, -SUBCELL_OFFSET],
  [SUBCELL_OFFSET, -SUBCELL_OFFSET],
  [-SUBCELL_OFFSET, SUBCELL_OFFSET],
  [SUBCELL_OFFSET, SUBCELL_OFFSET],
];
/** Lính đứng cách chỗ đứng quá chừng này (world px) thì được xếp lại vào ô con. */
export const SUBCELL_SNAP = 0.6;
/** Giây giữa hai lần xếp lính vào ô con. */
export const SUBCELL_PERIOD = 0.3;
/** Bán kính (ô) tìm ô bên cạnh còn chỗ khi một ô đã đủ 5 lính. */
export const SUBCELL_SPILL_RADIUS = 3;
