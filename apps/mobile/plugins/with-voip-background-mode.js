// Local Expo config plugin — VoIP push (PushKit) cho cuộc gọi đến.
//
// iOS chỉ giao VoIP push cho app có khai báo background mode `voip` trong
// Info.plist; thiếu khai báo này PushKit token vẫn đăng ký được nhưng push
// đến sẽ không đánh thức app. `remote-notification` cũng cần cho silent
// push thông thường (expo-notifications thường đã thêm — ở đây chỉ bổ sung
// khi chưa có, không ghi đè cấu hình sẵn).
//
// Không có plugin tương đương trên npm cho react-native-voip-push-notification
// nên plugin nhỏ này sống ngay trong repo. Chạy lúc `expo prebuild` / EAS build.
const { withInfoPlist } = require('@expo/config-plugins');

const withVoipBackgroundMode = config => {
  return withInfoPlist(config, cfg => {
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    modes.add('voip');
    modes.add('remote-notification');
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });
};

module.exports = withVoipBackgroundMode;
