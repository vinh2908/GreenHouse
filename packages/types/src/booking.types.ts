// ─── Booking Status State Machine ─────────────────────────────────────────────

export enum BookingStatus {
  DRAFT = 'draft',
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  SEARCHING_HELPER = 'searching_helper',
  HELPER_ASSIGNED = 'helper_assigned',
  HELPER_ACCEPTED = 'helper_accepted',
  HELPER_ON_THE_WAY = 'helper_on_the_way',
  HELPER_ARRIVED = 'helper_arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
  REFUNDED = 'refunded',
}

// Valid state transitions
export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.DRAFT]: [BookingStatus.PENDING_PAYMENT, BookingStatus.CANCELLED],
  [BookingStatus.PENDING_PAYMENT]: [BookingStatus.PAID, BookingStatus.CANCELLED],
  [BookingStatus.PAID]: [BookingStatus.SEARCHING_HELPER, BookingStatus.CANCELLED],
  [BookingStatus.SEARCHING_HELPER]: [BookingStatus.HELPER_ASSIGNED, BookingStatus.CANCELLED],
  [BookingStatus.HELPER_ASSIGNED]: [BookingStatus.HELPER_ACCEPTED, BookingStatus.CANCELLED],
  [BookingStatus.HELPER_ACCEPTED]: [BookingStatus.HELPER_ON_THE_WAY, BookingStatus.CANCELLED],
  [BookingStatus.HELPER_ON_THE_WAY]: [BookingStatus.HELPER_ARRIVED, BookingStatus.CANCELLED],
  [BookingStatus.HELPER_ARRIVED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED, BookingStatus.DISPUTED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [BookingStatus.REFUNDED],
  [BookingStatus.DISPUTED]: [BookingStatus.COMPLETED, BookingStatus.REFUNDED],
  [BookingStatus.REFUNDED]: [],
};

export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Booking Types ─────────────────────────────────────────────────────────────

export interface IBooking {
  _id: string;
  customer_id: string;
  helper_id?: string;
  service_id: string;
  status: BookingStatus;
  address: {
    full_address: string;
    district: string;
    city: string;
    location: {
      type: 'Point';
      coordinates: [number, number];
    };
    notes?: string;
  };
  scheduled_at: Date;
  duration_hours: number;
  description?: string;
  photos?: string[];
  price_breakdown: IPriceBreakdown;
  total_price: number;
  promotion_code?: string;
  discount_amount: number;
  final_price: number;
  payment_method?: string;
  payment_status: PaymentStatus;
  rating?: number;
  review?: string;
  events: IBookingEvent[];
  cancellation_reason?: string;
  cancelled_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IPriceBreakdown {
  base_price: number;
  hourly_rate: number;
  duration_hours: number;
  extra_fees: number;
  platform_fee: number;
  tax: number;
}

export interface IBookingEvent {
  status: BookingStatus;
  note?: string;
  actor_id: string;
  actor_role: string;
  timestamp: Date;
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded',
}
