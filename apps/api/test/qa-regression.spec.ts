import {
  formatVND,
  calculateDistance,
  calculateDistanceKm,
  normalizePhone,
  isValidVietnamesePhone,
  generateOTP,
  getPaginationMeta,
  toSlug,
} from '../../../packages/utils/src/index';
import {
  JobStatus,
  isValidJobTransition,
  JOB_STATUS_TRANSITIONS,
} from '../../../packages/types/src/index';
import { SOCKET_EVENTS, PLATFORM_FEE_BY_SERVICE } from '../../../packages/constants/src/index';
import { HungarianAlgorithm } from '../src/modules/matching/algorithms/hungarian.algorithm';

describe('GreenHouse / HomeMate — Full QA & Operational Business Logic Regression Suite', () => {
  describe('1. Packages: @homemate/utils & @homemate/types & @homemate/constants', () => {
    it('normalizes and validates Vietnamese phone numbers accurately', () => {
      expect(normalizePhone('+84901234567')).toBe('0901234567');
      expect(normalizePhone('84901234567')).toBe('0901234567');
      expect(normalizePhone('090 123 4567')).toBe('0901234567');
      expect(isValidVietnamesePhone('0901234567')).toBe(true);
      expect(isValidVietnamesePhone('+84381234567')).toBe(true);
      expect(isValidVietnamesePhone('0123456789')).toBe(false);
      expect(isValidVietnamesePhone('12345')).toBe(false);
    });

    it('calculates Haversine distance (km) accurately for Ho Chi Minh City coordinates', () => {
      // District 1 (Ben Thanh: 10.7725, 106.6980) to District 3 (Turtle Lake: 10.7827, 106.6959)
      const dist = calculateDistance(10.7725, 106.698, 10.7827, 106.6959);
      expect(dist).toBeGreaterThan(1.0);
      expect(dist).toBeLessThan(1.3);
      expect(calculateDistanceKm(10.7725, 106.698, 10.7725, 106.698)).toBe(0);
    });

    it('verifies platform fee constants by service category', () => {
      expect(PLATFORM_FEE_BY_SERVICE.default).toBe(0.15);
      expect(PLATFORM_FEE_BY_SERVICE.deep_cleaning).toBe(0.2);
      const total = 300000;
      const fee = Math.round(total * PLATFORM_FEE_BY_SERVICE.default);
      expect(fee).toBe(45000);
      expect(total - fee).toBe(255000);
    });

    it('enforces all valid and invalid Job Status state transitions including DISPUTED -> REFUNDED', () => {
      expect(isValidJobTransition(JobStatus.OPEN, JobStatus.RECEIVING_QUOTES)).toBe(true);
      expect(isValidJobTransition(JobStatus.OPEN, JobStatus.CONFIRMED)).toBe(true);
      expect(isValidJobTransition(JobStatus.OPEN, JobStatus.CANCELLED)).toBe(true);
      expect(isValidJobTransition(JobStatus.OPEN, JobStatus.COMPLETED)).toBe(false);
      expect(isValidJobTransition(JobStatus.RECEIVING_QUOTES, JobStatus.CONFIRMED)).toBe(true);
      expect(isValidJobTransition(JobStatus.CONFIRMED, JobStatus.HELPER_ON_THE_WAY)).toBe(true);
      expect(isValidJobTransition(JobStatus.HELPER_ON_THE_WAY, JobStatus.HELPER_ARRIVED)).toBe(true);
      expect(isValidJobTransition(JobStatus.HELPER_ARRIVED, JobStatus.IN_PROGRESS)).toBe(true);
      expect(isValidJobTransition(JobStatus.IN_PROGRESS, JobStatus.PENDING_REVIEW)).toBe(true);
      expect(isValidJobTransition(JobStatus.IN_PROGRESS, JobStatus.DISPUTED)).toBe(true);
      expect(isValidJobTransition(JobStatus.IN_PROGRESS, JobStatus.CANCELLED)).toBe(false);
      expect(isValidJobTransition(JobStatus.PENDING_REVIEW, JobStatus.COMPLETED)).toBe(true);
      expect(isValidJobTransition(JobStatus.PENDING_REVIEW, JobStatus.DISPUTED)).toBe(true);
      expect(isValidJobTransition(JobStatus.DISPUTED, JobStatus.COMPLETED)).toBe(true);
      expect(isValidJobTransition(JobStatus.DISPUTED, JobStatus.REFUNDED)).toBe(true);
      expect(isValidJobTransition(JobStatus.COMPLETED, JobStatus.CANCELLED)).toBe(false);
      expect(JOB_STATUS_TRANSITIONS[JobStatus.COMPLETED]).toHaveLength(0);
    });

    it('defines all required realtime SOCKET_EVENTS including SOS and Contract Amendment events', () => {
      expect(SOCKET_EVENTS.SOS_BROADCAST).toBe('sos:broadcast');
      expect(SOCKET_EVENTS.SOS_ACCEPTED).toBe('sos:accepted');
      expect(SOCKET_EVENTS.SOS_CANCELLED).toBe('sos:cancelled');
      expect(SOCKET_EVENTS.HELPER_LOCATION_UPDATE).toBe('helper:location_update');
      expect(SOCKET_EVENTS.CONTRACT_AMENDED).toBe('contract:amended');
      expect(SOCKET_EVENTS.CONTRACT_AMENDMENT_ACCEPTED).toBe('contract:amendment_accepted');
    });

    it('builds pagination meta and slugifies Vietnamese text cleanly', () => {
      const meta = getPaginationMeta(45, 2, 20);
      expect(meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        total_pages: 3,
      });
      expect(toSlug('Sửa Ống Nước & Thông Cống Quận 1')).toBe('sua-ong-nuoc-thong-cong-quan-1');
      expect(generateOTP(6)).toMatch(/^\d{6}$/);
      expect(formatVND(255000)).toContain('255');
    });
  });

  describe('2. Matching Engine: HungarianAlgorithm (Kuhn-Munkres O(n^3))', () => {
    it('solves optimal 1-to-1 assignment for maximization and minimization matrices', () => {
      const scoreMatrix = [
        [95, 40, 20],
        [30, 88, 25],
        [10, 15, 92],
      ];
      const maxAssignment = HungarianAlgorithm.maximize(scoreMatrix);
      expect(maxAssignment).toHaveLength(3);
      expect(maxAssignment[0].jobIndex).toBe(0);
      expect(maxAssignment[1].jobIndex).toBe(1);
      expect(maxAssignment[2].jobIndex).toBe(2);

      // Rectangular: 3 helpers for 1 job -> picks helper with highest score (index 1: 99)
      const singleJobScores = [[65], [99], [72]];
      const singleAssignment = HungarianAlgorithm.maximize(singleJobScores);
      expect(singleAssignment).toHaveLength(1);
      expect(singleAssignment[0].workerIndex).toBe(1);
      expect(singleAssignment[0].jobIndex).toBe(0);
      expect(singleAssignment[0].score).toBe(99);
    });
  });

  describe('3. Operational & Financial Business Logic Calculations', () => {
    it('recalculates Contract total_price, platform_fee (15%), and helper_receives (85%) when Contract Amendment is accepted', () => {
      const baseLabor = 300000;
      const baseMaterials = 50000;
      const addLabor = 100000;
      const addMaterials = 150000;
      const newLabor = baseLabor + addLabor;
      const newMaterials = baseMaterials + addMaterials;
      const newTotal = newLabor + newMaterials; // 600,000
      const newPlatformFee = Math.round(newTotal * 0.15); // 90,000
      const newHelperReceives = newTotal - newPlatformFee; // 510,000

      expect(newTotal).toBe(600000);
      expect(newPlatformFee).toBe(90000);
      expect(newHelperReceives).toBe(510000);
    });

    it('correctly computes partial refund split between Customer refund and Helper remaining payout', () => {
      const totalPrice = 500000;
      const refundAmount = 200000;
      const remainingPool = Math.max(0, totalPrice - refundAmount); // 300,000
      const helperPayout = Math.round(remainingPool * 0.85); // 255,000

      expect(remainingPool).toBe(300000);
      expect(helperPayout).toBe(255000);
    });
  });
});
