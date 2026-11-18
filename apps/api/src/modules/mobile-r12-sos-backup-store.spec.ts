// modules/mobile-r12-sos-backup-store.spec.ts — R12-24: a stale SOS popup
// stayed visible after a MANUAL cancel because the cancel event names the
// JOB, while the popup queue is keyed by SOS id. The new by-job removal
// actions are what the cancel handlers call; these cases pin them.
import { useSosBackupStore } from '@/stores/sos-backup.store';

const incomingA = {
  sos_id: 'sos-a',
  job_id: 'job-1',
  job_title: 'Job 1',
};
const incomingB = {
  sos_id: 'sos-b',
  job_id: 'job-2',
  job_title: 'Job 2',
};
const decisionA = {
  sos_id: 'sos-a',
  job_id: 'job-1',
  job_title: 'Job 1',
};

describe('R12-24: sos-backup store by-job removal', () => {
  beforeEach(() => {
    useSosBackupStore.setState({
      incomingQueue: [],
      incoming: null,
      decisionQueue: [],
      decision: null,
    });
  });

  it('removeIncomingByJob drops only that job’s invite and advances the queue', () => {
    const store = useSosBackupStore.getState();
    store.setIncoming(incomingA);
    store.setIncoming(incomingB);
    expect(useSosBackupStore.getState().incoming?.sos_id).toBe('sos-a');

    useSosBackupStore.getState().removeIncomingByJob('job-1');

    const state = useSosBackupStore.getState();
    expect(state.incomingQueue.map(i => i.sos_id)).toEqual(['sos-b']);
    expect(state.incoming?.sos_id).toBe('sos-b');
  });

  it('removeIncomingByJob on an unknown job leaves the queue alone', () => {
    useSosBackupStore.getState().setIncoming(incomingA);
    useSosBackupStore.getState().removeIncomingByJob('job-unknown');
    expect(useSosBackupStore.getState().incoming?.sos_id).toBe('sos-a');
  });

  it('removeDecisionByJob drops only that job’s decision popup', () => {
    const store = useSosBackupStore.getState();
    store.setDecision(decisionA);
    store.setDecision({ sos_id: 'sos-b', job_id: 'job-2' });
    expect(useSosBackupStore.getState().decision?.sos_id).toBe('sos-a');

    useSosBackupStore.getState().removeDecisionByJob('job-1');

    const state = useSosBackupStore.getState();
    expect(state.decisionQueue.map(d => d.sos_id)).toEqual(['sos-b']);
    expect(state.decision?.sos_id).toBe('sos-b');
  });
});
