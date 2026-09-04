import { create } from 'zustand';
import type { IBooking, BookingStatus } from '@homemate/types';

interface BookingState {
  activeBooking: IBooking | null;
  draftBooking: Partial<IBooking> | null;

  setActiveBooking: (booking: IBooking | null) => void;
  setDraftBooking: (draft: Partial<IBooking>) => void;
  clearDraft: () => void;
  updateBookingStatus: (status: BookingStatus) => void;
}

export const useBookingStore = create<BookingState>(set => ({
  activeBooking: null,
  draftBooking: null,

  setActiveBooking: booking => set({ activeBooking: booking }),

  setDraftBooking: draft =>
    set(state => ({ draftBooking: { ...state.draftBooking, ...draft } })),

  clearDraft: () => set({ draftBooking: null }),

  updateBookingStatus: status =>
    set(state => ({
      activeBooking: state.activeBooking ? { ...state.activeBooking, status } : null,
    })),
}));
