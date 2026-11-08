describe('K6: Offline Queue Optimistic Updates, Rollback on 4xx Conflict, and ETIMEDOUT Detection', () => {
  describe('ETIMEDOUT error detection', () => {
    function isNetworkError(err: unknown): boolean {
      const e = err as { response?: unknown; request?: unknown } | null;
      return !!e && typeof e === 'object' && !e.response;
    }

    function isTimeoutError(err: unknown): boolean {
      const e = err as { code?: string; message?: string } | null;
      return (
        e?.code === 'ECONNABORTED' ||
        e?.code === 'ETIMEDOUT' ||
        (typeof e?.message === 'string' && /timeout/i.test(e.message))
      );
    }

    function isNetworkLostError(err: unknown): boolean {
      return isNetworkError(err) && !isTimeoutError(err);
    }

    it('ETIMEDOUT được nhận diện là timeout, không phải mất mạng', () => {
      const err = { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 127.0.0.1:3000' };
      expect(isNetworkError(err)).toBe(true);
      expect(isTimeoutError(err)).toBe(true);
      expect(isNetworkLostError(err)).toBe(false);
    });

    it('ECONNABORTED được nhận diện là timeout', () => {
      const err = { code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' };
      expect(isTimeoutError(err)).toBe(true);
      expect(isNetworkLostError(err)).toBe(false);
    });

    it('Mất mạng không có code timeout được nhận diện là network lost', () => {
      const err = { message: 'Network Error' };
      expect(isNetworkError(err)).toBe(true);
      expect(isTimeoutError(err)).toBe(false);
      expect(isNetworkLostError(err)).toBe(true);
    });
  });

  describe('Optimistic update and rollback on 4xx conflict', () => {
    it('mất mạng → thao tác lưu optimistic + previous_status → flush gặp 409 xung đột → trạng thái rollback về previous_status', async () => {
      // Mô phỏng bộ nhớ cache (AsyncStorage & React Query cache)
      const cachedJob: Record<string, any> = {
        _id: 'job-123',
        status: 'confirmed',
        title: 'Dọn nhà',
      };
      const queryClientCache = new Map<string, any>();
      queryClientCache.set('job-job-123', { ...cachedJob });

      // Action queue
      const queue: any[] = [];

      // Enqueue action khi mất mạng
      const prevStatus = cachedJob.status;
      const optimisticStatus = 'helper_on_the_way';

      queue.push({
        id: 'action-1',
        kind: 'on_the_way',
        job_id: 'job-123',
        previous_status: prevStatus,
      });

      // Áp dụng optimistic
      cachedJob.status = optimisticStatus;
      queryClientCache.set('job-job-123', { ...cachedJob, status: optimisticStatus });

      expect(cachedJob.status).toBe('helper_on_the_way');
      expect(queryClientCache.get('job-job-123').status).toBe('helper_on_the_way');

      // Giả lập flushQueue: gọi API bị 409 Conflict
      const apiPatch = jest.fn().mockRejectedValue({
        response: { status: 409, data: { message: 'Job already cancelled by customer' } },
      });

      // Xử lý flush queue
      let conflicts = 0;
      while (queue.length > 0) {
        const item = queue[0];
        try {
          await apiPatch(`/jobs/${item.job_id}/on-the-way`);
          queue.shift();
        } catch (err: any) {
          const status = err?.response?.status;
          if (status && status >= 400 && status < 500) {
            // Xung đột 4xx: server thắng, rollback
            queue.shift();
            conflicts++;
            if (item.previous_status) {
              cachedJob.status = item.previous_status;
              queryClientCache.set('job-job-123', {
                ...cachedJob,
                status: item.previous_status,
              });
            }
          }
        }
      }

      // Assert: Đã ghi nhận xung đột và trạng thái đã được rollback về đúng previous_status ('confirmed')
      expect(conflicts).toBe(1);
      expect(queue).toHaveLength(0);
      expect(cachedJob.status).toBe('confirmed');
      expect(queryClientCache.get('job-job-123').status).toBe('confirmed');
    });
  });
});
