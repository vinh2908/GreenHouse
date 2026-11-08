describe('K5: Mobile Auth / Startup Token Refresh and 401 Classification', () => {
  it('giả lập lỗi mạng trong lúc refresh → phiên sống, /auth/me được thử lại (không đăng xuất ép)', async () => {
    let isAuthenticated = true;
    let authUser: any = { id: 'user1', full_name: 'Nguyen Van A' };
    let retryCount = 0;

    // Giả lập logic auth store xử lý startup
    const handleAuthStartup = async (fetchMeApi: () => Promise<any>, retries = 2) => {
      try {
        const res = await fetchMeApi();
        authUser = res.data;
      } catch (err: any) {
        const isNetworkError =
          err?.isNetworkRefreshError ||
          !err?.response ||
          err?.code === 'ECONNABORTED' ||
          err?.message?.includes('Network Error') ||
          err?.message?.includes('timeout') ||
          (err?.response?.status && err.response.status >= 500);

        const isTrue401 =
          (err?.response?.status === 401 || err?.name === 'SessionExpiredError') &&
          !isNetworkError;

        if (isTrue401) {
          isAuthenticated = false;
          authUser = null;
        } else {
          // Phiên sống, thử lại
          if (retries > 0) {
            retryCount++;
            await handleAuthStartup(fetchMeApi, retries - 1);
          }
        }
      }
    };

    // Giả lập lỗi mạng khi gọi API refresh
    const mockNetworkError: any = new Error('Network Error');
    mockNetworkError.isNetworkRefreshError = true;
    mockNetworkError.code = 'ECONNABORTED';

    const mockApi = jest.fn().mockRejectedValue(mockNetworkError);

    await handleAuthStartup(mockApi, 2);

    // Assert: phiên vẫn sống, không bị đăng xuất ép
    expect(isAuthenticated).toBe(true);
    expect(authUser).not.toBeNull();
    expect(authUser.id).toBe('user1');
    // Assert: /auth/me được tự động thử lại 2 lần
    expect(retryCount).toBe(2);
    expect(mockApi).toHaveBeenCalledTimes(3);
  });

  it('giả lập 401 thật sự từ server → đăng xuất đúng', async () => {
    let isAuthenticated = true;
    let authUser: any = { id: 'user1', full_name: 'Nguyen Van A' };
    let retryCount = 0;

    const handleAuthStartup = async (fetchMeApi: () => Promise<any>, retries = 2) => {
      try {
        const res = await fetchMeApi();
        authUser = res.data;
      } catch (err: any) {
        const isNetworkError =
          err?.isNetworkRefreshError ||
          !err?.response ||
          err?.code === 'ECONNABORTED' ||
          err?.message?.includes('Network Error') ||
          err?.message?.includes('timeout') ||
          (err?.response?.status && err.response.status >= 500);

        const isTrue401 =
          (err?.response?.status === 401 || err?.name === 'SessionExpiredError') &&
          !isNetworkError;

        if (isTrue401) {
          isAuthenticated = false;
          authUser = null;
        } else {
          if (retries > 0) {
            retryCount++;
            await handleAuthStartup(fetchMeApi, retries - 1);
          }
        }
      }
    };

    // Giả lập server trả 401 Unauthorized thật
    const mockTrue401Error: any = new Error('Unauthorized');
    mockTrue401Error.response = { status: 401, data: { message: 'Invalid token' } };

    const mockApi = jest.fn().mockRejectedValue(mockTrue401Error);

    await handleAuthStartup(mockApi, 2);

    // Assert: Đăng xuất đúng
    expect(isAuthenticated).toBe(false);
    expect(authUser).toBeNull();
    // Không thử lại khi 401 thật
    expect(retryCount).toBe(0);
    expect(mockApi).toHaveBeenCalledTimes(1);
  });
});
