// Local Expo config plugin cho react-native-callkeep trên Android & iOS.
// Đảm bảo Service ConnectionService và quyền hệ thống Telecom / VoIP
// luôn được sinh ra chính xác lúc prebuild và biên dịch native.
const { withAndroidManifest, withInfoPlist, AndroidConfig } = require('@expo/config-plugins');

const withCallkeep = config => {
  // 1. Android: Cấu hình ConnectionService và quyền Telecom
  config = withAndroidManifest(config, cfg => {
    const androidManifest = cfg.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    if (!Array.isArray(mainApplication.service)) {
      mainApplication.service = [];
    }

    // RNCallKeepBackgroundMessagingService
    if (
      !mainApplication.service.find(
        item =>
          item.$ &&
          item.$['android:name'] === 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService',
      )
    ) {
      mainApplication.service.push({
        $: {
          'android:name': 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService',
          'android:exported': 'true',
        },
      });
    }

    // VoiceConnectionService
    let voiceService = mainApplication.service.find(
      item => item.$ && item.$['android:name'] === 'io.wazo.callkeep.VoiceConnectionService',
    );

    if (!voiceService) {
      voiceService = {
        $: {
          'android:name': 'io.wazo.callkeep.VoiceConnectionService',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
          'android:foregroundServiceType': 'phoneCall',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.telecom.ConnectionService',
                },
              },
            ],
          },
        ],
      };
      mainApplication.service.push(voiceService);
    } else {
      voiceService.$['android:permission'] = 'android.permission.BIND_TELECOM_CONNECTION_SERVICE';
      voiceService.$['android:exported'] = 'true';
      voiceService.$['android:foregroundServiceType'] = 'phoneCall';
      if (!voiceService['intent-filter']) {
        voiceService['intent-filter'] = [
          {
            action: [
              {
                $: {
                  'android:name': 'android.telecom.ConnectionService',
                },
              },
            ],
          },
        ];
      }
    }

    return cfg;
  });

  // 2. Thêm các quyền Android cần thiết cho CallKeep & Voice Call
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
    'android.permission.MANAGE_OWN_CALLS',
    'android.permission.READ_PHONE_STATE',
    'android.permission.READ_PHONE_NUMBERS',
    'android.permission.CALL_PHONE',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
  ]);

  // 3. iOS: UIBackgroundModes voip
  config = withInfoPlist(config, cfg => {
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    modes.add('voip');
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });

  return config;
};

module.exports = withCallkeep;
