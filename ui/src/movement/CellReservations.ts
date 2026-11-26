import { CELL_SIZE } from '../constants';
import type { Unit } from '../entities/Unit';
import { CELL_RESERVE_SECONDS } from './MovementConfig';

/**
 * Giữ ô cho xe mặt đất (kiểu RA2: mỗi ô tối đa một xe). Mỗi tick dựng lại "ô đang đứng" của mọi xe; xe muốn lăn
 * sang ô khác phải đặt chỗ ô đó trước (claim). Ô đang có xe khác đứng, hoặc đã bị xe khác đặt chỗ, thì phải chờ.
 * Dùng Map theo chỉ số ô (bản đồ rất lớn, chỉ vài trăm xe) và tái sử dụng giữa các tick, không cấp phát trong vòng lặp.
 */
export class CellReservations {
  /** Ô → id xe đang đứng trong ô (tâm thân xe). */
  private readonly standing = new Map<number, number>();
  /** Ô → xe đã đặt chỗ và hạn giữ (giây game). */
  private readonly reserved = new Map<number, { id: number; until: number }>();
  private time = 0;

  constructor(private readonly width: number) {}

  /** Chỉ số ô của một điểm world. */
  index(px: number, py: number): number {
    return Math.floor(py / CELL_SIZE) * this.width + Math.floor(px / CELL_SIZE);
  }

  /** Đầu mỗi tick: ghi lại ô từng xe đang đứng, bỏ các chỗ đặt đã hết hạn. */
  rebuild(drivers: readonly Unit[], time: number): void {
    this.time = time;
    this.standing.clear();
    for (const u of drivers) {
      const i = this.index(u.px, u.py);
      if (!this.standing.has(i)) this.standing.set(i, u.id);
    }
    for (const [i, r] of this.reserved) if (r.until <= time) this.reserved.delete(i);
  }

  /** Xe `u` xin lăn vào ô (cx, cy): true = được (đặt chỗ luôn), false = phải chờ. */
  claim(u: Unit, cx: number, cy: number): boolean {
    const i = cy * this.width + cx;
    const s = this.standing.get(i);
    if (s !== undefined && s !== u.id) return false;
    const r = this.reserved.get(i);
    if (r && r.id !== u.id && r.until > this.time) return false;
    this.reserved.set(i, { id: u.id, until: this.time + CELL_RESERVE_SECONDS });
    return true;
  }

  /** Id xe đang đứng hoặc đã đặt chỗ ở ô `i` (null nếu trống). */
  holder(i: number): number | null {
    const s = this.standing.get(i);
    if (s !== undefined) return s;
    const r = this.reserved.get(i);
    return r && r.until > this.time ? r.id : null;
  }

  /** Ô `i` có trống (không xe đứng, không ai đặt chỗ) với xe `id`? */
  freeFor(i: number, id: number): boolean {
    const h = this.holder(i);
    return h === null || h === id;
  }

  /** Các ô đang bị giữ (cho chế độ debug): [chỉ số ô, id, true = chỉ đặt chỗ]. */
  *cells(): Generator<[number, number, boolean]> {
    for (const [i, id] of this.standing) yield [i, id, false];
    for (const [i, r] of this.reserved) if (r.until > this.time && !this.standing.has(i)) yield [i, r.id, true];
  }
}
