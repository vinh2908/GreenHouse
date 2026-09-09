import { create } from 'zustand';

interface BookingState {
  activeBooking: any | null;
  draftBooking: any | null;

  setActiveBooking: (booking: any | null) => void;
  setDraftBooking: (draft: any) => void;
  clearDraft: () => void;
  updateBookingStatus: (status: any) => void;
}

export const useBookingStore = create<BookingState>(set => ({
  activeBooking: null,
  draftBooking: null,

  setActiveBooking: booking => set({ activeBooking: booking }),

  setDraftBooking: draft => set(state => ({ draftBooking: { ...state.draftBooking, ...draft } })),

  clearDraft: () => set({ draftBooking: null }),

  updateBookingStatus: status =>
    set(state => ({
      activeBooking: state.activeBooking ? { ...state.activeBooking, status } : null,
    })),
}));
