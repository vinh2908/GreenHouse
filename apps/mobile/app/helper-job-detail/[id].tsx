import { useState, useMemo, useCallback } from 'react';
import { formatDate } from '@/utils/date-format';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Navigation,
  Camera,
  MessageCircle,
  X,
  Video,
  ImagePlus,
  Trash2,
  Sparkles,
  PlusCircle,
  Phone,
  Ban,
  CheckCircle2,
  DollarSign,
  MapPin,
  Clock,
  RotateCcw,
  AlertCircle,
  ClipboardList,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useJobSocketUpdates } from '@/hooks/use-socket';
import { useLiveGpsStore } from '@/hooks/use-live-gps';
import { Alert } from '@/components/common/app-alert';
import { LiveTrackingMap, RouteMetrics } from '@/components/common/live-tracking-map';
import { TeamCard } from '@/components/common/team-card';
import { OfflineBanner } from '@/components/common/offline-banner';
import { SosBackupHelperCard } from '@/components/common/sos-backup-helper-card';
import { formatDisplayAddress } from '@/utils/address-formatter';

dayjs.extend(relativeTime);

import {
  useJobDetail,
  useJobQuotes,
  useJobContract,
  useSubmitQuote,
  useHelperOnTheWay,
  useHelperArrived,
  useStartJob,
  useCompleteJob,
  useHelperProfile,
  useProposeAmendment,
  useCallConfig,
  useAcceptFixedPrice,
  useRejectJob,
  useUnrejectJob,
  useCancelJob,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { mapServerErrorMessage } from '@/services/i18n';
import {
  Button,
  Card,
  JobStatusBadge,
  COLORS,
  LoadingSpinner,
  EmptyState,
  ErrorState,
  Separator,
  PriceText,
  Badge,
  useThemeColors,
} from '@/components/ui';
import Toast from 'react-native-toast-message';

// S3: no hardcoded platform fee here — the per-service fee percent is
// derived from job.service_id inside the component (see quoteFeePercent).

export default function HelperJobDetailScreen() {
  const rawParams = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawParams.id) ? rawParams.id[0] : rawParams.id;
  const router = useRouter();
  const { t, tService, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const currentUser = useAuthStore(s => s.user);
  const { data: callConfig } = useCallConfig();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(helper)/jobs');
  };

  // ── Realtime Socket Updates ──────────────────────────────────────────────
  useJobSocketUpdates(id);
  const { width } = useWindowDimensions();

  const { data: job, isLoading, isError, error: jobError, refetch: refetchJob } = useJobDetail(id);
  const { data: quotes } = useJobQuotes(id);
  const { data: contract } = useJobContract(id);
  const { data: helperProfile } = useHelperProfile();
  const gps = useLiveGpsStore(s => s.point);
  const gpsError = useLiveGpsStore(s => s.error);
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);

  const handleRouteMetrics = useCallback((metrics: RouteMetrics | null) => {
    setRouteMetrics(prev => {
      if (!prev && !metrics) return prev;
      if (!prev || !metrics) return metrics;
      if (
        Math.abs(prev.distanceKm - metrics.distanceKm) >= 0.1 ||
        prev.etaMinutes !== metrics.etaMinutes
      ) {
        return metrics;
      }
      return prev;
    });
  }, []);

  const customerLocation = useMemo(() => {
    const coords = job?.address?.location?.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
    return {
      latitude: coords[1],
      longitude: coords[0],
    };
  }, [job?.address?.location?.coordinates?.[0], job?.address?.location?.coordinates?.[1]]);

  const helperLocation = useMemo(() => {
    if (!gps?.lat || !gps?.lng) return null;
    return { latitude: gps.lat, longitude: gps.lng };
  }, [gps?.lat, gps?.lng]);

  // B7, D-ETA, G2, G3: Thống nhất khoảng cách và ETA: ưu tiên metrics từ routing server / live map
  const effectiveMetrics = useMemo(() => {
    if (routeMetrics) return routeMetrics;
    const etaMins = (job as any)?.estimated_minutes ?? (job as any)?.estimated_travel_minutes;
    if ((job as any)?.distance_km != null && etaMins != null) {
      return {
        distanceKm: (job as any).distance_km,
        etaMinutes: etaMins,
      };
    }
    // G3: Bỏ fallback haversine phía client ở màn chi tiết (không tự tính đường thẳng 25km/h khi server thiếu số liệu)
    return null;
  }, [
    routeMetrics,
    (job as any)?.distance_km,
    (job as any)?.estimated_minutes,
    (job as any)?.estimated_travel_minutes,
  ]);

  const submitQuote = useSubmitQuote();
  const acceptFixed = useAcceptFixedPrice();
  const rejectJob = useRejectJob();
  const unrejectJob = useUnrejectJob();
  const cancelJobMutation = useCancelJob();

  const getJobServiceLabel = (j: any) => {
    if (j?.custom_service_name && String(j.custom_service_name).trim()) {
      return `${t('common_service')}: ${String(j.custom_service_name).trim()}`;
    }
    const svcName = tService(j?.service_id);
    if (svcName) return svcName;
    return t('common_service');
  };
  const onTheWay = useHelperOnTheWay();
  const arrived = useHelperArrived();
  const startJob = useStartJob();
  const completeJob = useCompleteJob();
  const proposeAmendment = useProposeAmendment();

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [laborCost, setLaborCost] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('3');
  const [notes, setNotes] = useState('');

  // ── Contract Amendment Proposal States ───────────────────────────────────
  const [showAmendmentModal, setShowAmendmentModal] = useState(false);
  const [amendLaborCost, setAmendLaborCost] = useState('');
  const [amendMaterialsCost, setAmendMaterialsCost] = useState('');
  const [amendReason, setAmendReason] = useState('');

  // ── Cancellation States (A76) ─────────────────────────────────────────
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonChip, setCancelReasonChip] = useState('');
  const [cancelReasonText, setCancelReasonText] = useState('');

  // ── Completion Evidence States ───────────────────────────────────────────
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [completionVideos, setCompletionVideos] = useState<string[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');

  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: insets.top,
        }}
      >
        <LoadingSpinner />
      </View>
    );
  }

  const is401 =
    (jobError as any)?.response?.status === 401 ||
    (jobError as any)?.status === 401 ||
    (jobError as any)?.name === 'SessionExpiredError' ||
    (jobError as any)?.isSessionExpired;

  if (is401) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          paddingTop: insets.top,
        }}
      >
        <EmptyState
          icon={<AlertCircle size={40} color={COLORS.gray[400]} />}
          title={lang === 'en' ? 'Session expired' : 'Phiên đăng nhập đã hết hạn'}
          subtitle={
            lang === 'en'
              ? 'Your session has expired. Please log in again to view job details.'
              : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem chi tiết đơn.'
          }
          action={lang === 'en' ? 'Log in again' : 'Đăng nhập lại'}
          onAction={() => router.replace('/(auth)/login')}
        />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          paddingTop: insets.top,
        }}
      >
        <ErrorState
          title={lang === 'en' ? 'Unable to load job details' : 'Không thể tải chi tiết đơn hàng'}
          subtitle={
            lang === 'en'
              ? 'Could not connect to job service. Please retry.'
              : 'Không thể kết nối đến máy chủ. Vui lòng bấm thử lại.'
          }
          onRetry={() => refetchJob()}
        />
      </View>
    );
  }

  if (!job) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          paddingTop: insets.top,
        }}
      >
        <EmptyState
          icon={<ClipboardList size={40} color={COLORS.gray[400]} />}
          title={lang === 'en' ? 'Job not found' : 'Không tìm thấy đơn hàng'}
          subtitle={
            lang === 'en'
              ? 'This job may have been removed or does not exist.'
              : 'Đơn hàng này có thể đã bị xóa hoặc không tồn tại.'
          }
          action={lang === 'en' ? 'Back to jobs' : 'Về danh sách việc'}
          onAction={handleBack}
        />
      </View>
    );
  }

  // Kiểm tra xem thợ hiện tại đã từ chối đơn này chưa
  const isRejectedByMe = Boolean(
    job.rejected_helper_ids?.some((rid: any) => {
      const rIdStr = typeof rid === 'string' ? rid : rid?._id || rid?.toString?.();
      return rIdStr === currentUser?._id;
    }),
  );

  // Kiểm tra xem thợ hiện tại đã gửi báo giá chưa (ẩn nếu đã từ chối hoặc báo giá không còn pending)
  const myQuote = isRejectedByMe
    ? null
    : quotes?.find((q: any) => {
        const helperId = typeof q.helper_id === 'string' ? q.helper_id : q.helper_id?._id;
        return helperId === currentUser?._id && q.status === 'pending';
      });

  const quoteServiceObj =
    typeof job.service_id === 'object' && job.service_id ? (job.service_id as any) : null;

  // S3 & M-17: fee percent shown for my quote comes from the server-computed
  // split (helper_receives / total_price), never a hardcoded 15%.
  const myQuoteFeePercent =
    myQuote?.total_price > 0
      ? Math.round(100 - (myQuote.helper_receives / myQuote.total_price) * 100)
      : (quoteServiceObj?.platform_fee_percent ?? null);

  const handleOpenQuoteModal = () => {
    if (helperProfile?.verification_status !== 'approved') {
      const msg = t('helper_job.kyc_required_msg');
      Alert.alert(t('helper_job.kyc_required_title'), msg, [
        { text: t('common_cancel'), style: 'cancel' },
        { text: t('helper_job.kyc_verify_now'), onPress: () => router.push('/kyc') },
      ]);
      return;
    }
    setShowQuoteModal(true);
  };
  const total = Number(laborCost) || 0;
  // S3: platform fee is per-service (service.platform_fee_percent) — never
  // a hardcoded 15% (deep cleaning charges 20%). Falls back to 15% only
  // when the service record carries no fee percent.
  const quoteFeePercent = quoteServiceObj?.platform_fee_percent ?? 15;
  const platformFee = Math.round((total * quoteFeePercent) / 100);
  const helperReceives = total - platformFee;

  const handleSubmitQuote = async () => {
    if (!laborCost || Number(laborCost) < 50000) {
      Toast.show({ type: 'error', text1: t('helper_job.min_quote_toast') });
      return;
    }
    try {
      await submitQuote.mutateAsync({
        jobId: id!,
        labor_cost: Number(laborCost),
        estimated_duration: Number(estimatedDuration),
        notes: notes || undefined,
      });
      Toast.show({
        type: 'success',
        text1: t('helper_job.quote_success_title'),
        text2: t('helper_job.quote_success_desc'),
      });
      setShowQuoteModal(false);
    } catch (err: unknown) {
      const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const msg = serverMsg ? mapServerErrorMessage(serverMsg, lang) : t('helper_job.quote_fail');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  // Feature 7/9: đơn giá cam kết hoặc đơn bảo hành — nhận trực tiếp, ẩn form báo giá
  const isDirectAcceptJob = !!job.is_fixed_price || !!job.is_warranty;
  const fixedServiceObj =
    typeof job.service_id === 'object' && job.service_id ? (job.service_id as any) : null;
  const hasFixedFee = fixedServiceObj?.platform_fee_percent != null;
  const fixedFeePercent = fixedServiceObj?.platform_fee_percent ?? 15;
  const fixedHelperReceives = job.is_fixed_price
    ? (job.fixed_price ?? 0) - Math.round(((job.fixed_price ?? 0) * fixedFeePercent) / 100)
    : 0;

  const handleAcceptDirect = async () => {
    try {
      await acceptFixed.mutateAsync(id!);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.message;
      const msg = serverMsg ? mapServerErrorMessage(serverMsg, lang) : t('helper_job.accept_fail');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleRejectJob = () => {
    Alert.alert(t('helper_job.reject_title'), t('helper_job.reject_desc'), [
      { text: t('common_cancel'), style: 'cancel' },
      {
        text: t('helper_job.reject_confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await rejectJob.mutateAsync(id!);
            Toast.show({
              type: 'success',
              text1: t('helper_job.reject_success_title'),
              text2: t('helper_job.reject_success_desc'),
            });
            router.back();
          } catch (err: any) {
            const serverMsg = err?.response?.data?.message || err?.message;
            const msg = serverMsg ? mapServerErrorMessage(serverMsg, lang) : t('helper_job.reject_fail');
            Toast.show({ type: 'error', text1: msg });
          }
        },
      },
    ]);
  };

  const handleHelperCancelJob = () => {
    setCancelReasonChip('');
    setCancelReasonText('');
    setShowCancelModal(true);
  };

  const handleConfirmHelperCancel = async () => {
    const finalReason = cancelReasonChip
      ? cancelReasonText.trim()
        ? `${cancelReasonChip}: ${cancelReasonText.trim()}`
        : cancelReasonChip
      : cancelReasonText.trim();
    if (!finalReason) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please select or enter a cancellation reason'
            : 'Vui lòng chọn hoặc nhập lý do hủy đơn',
      });
      return;
    }
    try {
      await cancelJobMutation.mutateAsync({
        jobId: id!,
        reason: finalReason,
      });
      setShowCancelModal(false);
      Toast.show({
        type: 'success',
        text1: lang === 'en' ? 'Job cancelled' : 'Đã hủy đơn hàng thành công',
      });
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.message;
      const msg = serverMsg
        ? mapServerErrorMessage(serverMsg, lang)
        : (lang === 'en' ? 'Failed to cancel job' : 'Không thể hủy đơn hàng');
      Alert.alert(t('common_error'), msg);
    }
  };

  const handleSubmitAmendment = async () => {
    const addLabor = Number(amendLaborCost) || 0;
    const addMat = Number(amendMaterialsCost) || 0;
    if (addLabor + addMat <= 0) {
      Toast.show({
        type: 'error',
        text1: t('helper_job.amendment_amount_err'),
      });
      return;
    }
    if (!amendReason.trim() || amendReason.trim().length < 5) {
      Toast.show({
        type: 'error',
        text1: t('helper_job.amendment_reason_err'),
      });
      return;
    }
    try {
      await proposeAmendment.mutateAsync({
        jobId: id!,
        additional_labor_cost: addLabor,
        additional_materials_cost: addMat,
        reason: amendReason.trim(),
      });
      setShowAmendmentModal(false);
      setAmendLaborCost('');
      setAmendMaterialsCost('');
      setAmendReason('');
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.message;
      const msg = serverMsg ? mapServerErrorMessage(serverMsg, lang) : t('helper_job.amendment_submit_fail');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  // ── Media Picker Actions ──────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    try {
      // B14: camera không hỗ trợ trên web → chọn ảnh từ thư viện (mẫu home.tsx)
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          setCompletionPhotos(prev => [...prev, result.assets[0].uri]);
        }
        return;
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: t('helper_job.evidence_camera_perm') });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCompletionPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch {
      Toast.show({ type: 'error', text1: t('helper_job.evidence_camera_err') });
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: t('helper_job.evidence_gallery_perm') });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map(a => a.uri);
        setCompletionPhotos(prev => [...prev, ...newUris]);
      }
    } catch {
      Toast.show({ type: 'error', text1: t('helper_job.evidence_gallery_err') });
    }
  };

  const handleRecordVideo = async () => {
    try {
      // B14: quay video không hỗ trợ trên web → chọn video từ thư viện
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
          quality: 0.7,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          setCompletionVideos(prev => [...prev, result.assets[0].uri]);
        }
        return;
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: t('helper_job.evidence_video_camera_perm') });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 60,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCompletionVideos(prev => [...prev, result.assets[0].uri]);
      }
    } catch {
      Toast.show({ type: 'error', text1: t('helper_job.evidence_video_record_err') });
    }
  };

  const handlePickVideo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: t('helper_job.evidence_video_gallery_perm') });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
        selectionLimit: 2,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map(a => a.uri);
        setCompletionVideos(prev => [...prev, ...newUris]);
      }
    } catch {
      Toast.show({ type: 'error', text1: t('helper_job.evidence_video_gallery_err') });
    }
  };

  const handleCompleteSubmission = async () => {
    if (completionPhotos.length === 0 && completionVideos.length === 0) {
      const msg = t('helper_job.evidence_no_media_msg');
      const doSubmit = async () => {
        try {
          await completeJob.mutateAsync({
            jobId: id!,
            completion_photos: completionPhotos,
            completion_videos: completionVideos,
            completion_notes: completionNotes || undefined,
          });
          setShowCompleteModal(false);
        } catch (err: any) {
          const serverMsg = err?.response?.data?.message || err?.message;
          const m = serverMsg
            ? mapServerErrorMessage(serverMsg, lang)
            : (lang === 'en' ? 'Update failed' : 'Cập nhật thất bại');
          Toast.show({ type: 'error', text1: m });
        }
      };

      Alert.alert(t('helper_job.evidence_no_media_title'), msg, [
        { text: t('helper_job.evidence_capture_now'), style: 'cancel' },
        { text: t('helper_job.evidence_submit_anyway'), onPress: doSubmit },
      ]);
      return;
    }

    try {
      await completeJob.mutateAsync({
        jobId: id!,
        completion_photos: completionPhotos,
        completion_videos: completionVideos,
        completion_notes: completionNotes || undefined,
      });
      setShowCompleteModal(false);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.message;
      const msg = serverMsg
        ? mapServerErrorMessage(serverMsg, lang)
        : (lang === 'en' ? 'Update failed' : 'Cập nhật thất bại');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleAction = (action: string) => {
    if (action === 'complete') {
      setShowCompleteModal(true);
      return;
    }

    const doExecute = async () => {
      try {
        // Feature 16: mutation có thể trả sentinel { queued_offline: true } khi
        // mất mạng — thao tác đã vào hàng đợi (đã có toast riêng), không báo
        // "thành công" như bình thường.
        if (action === 'on_the_way') {
          const res: any = await onTheWay.mutateAsync(id!);
          if (!res?.queued_offline)
            Toast.show({ type: 'success', text1: t('helper_job.step_moving_toast') });
        } else if (action === 'arrived') {
          const res: any = await arrived.mutateAsync(id!);
          if (!res?.queued_offline)
            Toast.show({ type: 'success', text1: t('helper_job.step_arrived_toast') });
        } else if (action === 'start') {
          const res: any = await startJob.mutateAsync(id!);
          if (!res?.queued_offline)
            Toast.show({ type: 'success', text1: t('helper_job.step_working_toast') });
        }
      } catch (err: any) {
        const serverMsg = err?.response?.data?.message || err?.message;
        const msg = serverMsg
          ? mapServerErrorMessage(serverMsg, lang)
          : (lang === 'en' ? 'Progress update failed' : 'Cập nhật tiến trình thất bại');
        Toast.show({ type: 'error', text1: msg });
      }
    };

    const config: Record<string, { title: string; message: string; btn: string }> = {
      on_the_way: {
        title: t('helper_job.step_moving_title'),
        message: t('helper_job.step_moving_msg'),
        btn: t('helper_job.step_moving_btn'),
      },
      arrived: {
        title: t('helper_job.step_arrived_title'),
        message: t('helper_job.step_arrived_msg'),
        btn: t('helper_job.step_arrived_btn'),
      },
      start: {
        title: t('helper_job.step_working_title'),
        message: t('helper_job.step_working_msg'),
        btn: t('helper_job.step_working_btn'),
      },
    };

    const actionCfg = config[action] || {
      title: lang === 'en' ? 'Confirm action?' : 'Xác nhận thao tác?',
      message:
        lang === 'en'
          ? 'Are you sure you want to update this status?'
          : 'Bạn có chắc chắn muốn cập nhật trạng thái này?',
      btn: lang === 'en' ? 'Confirm' : 'Xác nhận',
    };

    Alert.alert(actionCfg.title, actionCfg.message, [
      { text: t('common_cancel'), style: 'cancel' },
      { text: actionCfg.btn, onPress: doExecute },
    ]);
  };

  const helperIdStr = job.helper_id
    ? typeof job.helper_id === 'string'
      ? job.helper_id
      : job.helper_id._id || job.helper_id.toString?.()
    : null;
  const isAssignedToMe = Boolean(helperIdStr && String(helperIdStr) === String(currentUser?._id));
  const isMyActiveJob =
    isAssignedToMe && !['cancelled', 'completed', 'refunded'].includes(job.status);
  const canProposeAmendment =
    isMyActiveJob &&
    ['confirmed', 'helper_on_the_way', 'helper_arrived', 'in_progress'].includes(job.status);

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <OfflineBanner />
      {/* Header (Safe Insets) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: fs(17),
            fontWeight: '800',
            color: tc.text,
            flex: 1,
            marginLeft: 12,
          }}
          numberOfLines={1}
        >
          {job.title}
        </Text>
        <JobStatusBadge status={job.status} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        {/* ── Cancelled Status Banner ─────────────────────────────── */}
        {job.status === 'cancelled' && (
          <Card
            style={{
              backgroundColor: '#FEF2F2',
              borderColor: '#FECACA',
              borderWidth: 1.5,
              padding: 16,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ban size={22} color="#DC2626" />
              <Text style={{ fontSize: fs(16), fontWeight: '800', color: '#991B1B' }}>
                {job.cancelled_by_role === 'admin'
                  ? lang === 'en'
                    ? 'Admin cancelled this job'
                    : 'Admin đã hủy đơn hàng'
                  : job.cancelled_by_role === 'customer'
                    ? lang === 'en'
                      ? 'Customer cancelled this job'
                      : 'Khách hàng đã hủy đơn hàng'
                    : job.cancelled_by_role === 'helper'
                      ? String(job.cancelled_by) === String(currentUser?._id)
                        ? lang === 'en'
                          ? 'You cancelled this job'
                          : 'Bạn đã hủy đơn hàng này'
                        : lang === 'en'
                          ? 'Helper cancelled this job'
                          : 'Thợ đã hủy đơn hàng'
                      : String(job.cancelled_by) === String(currentUser?._id)
                        ? lang === 'en'
                          ? 'You cancelled this job'
                          : 'Bạn đã hủy đơn hàng này'
                        : lang === 'en'
                          ? 'Customer cancelled this job'
                          : 'Khách hàng đã hủy đơn hàng'}
              </Text>
            </View>
            {job.cancellation_reason ? (
              <Text style={{ fontSize: fs(14), color: '#7F1D1D', lineHeight: 20 }}>
                {lang === 'en' ? 'Reason: ' : 'Lý do: '}
                <Text style={{ fontWeight: '600' }}>{job.cancellation_reason}</Text>
              </Text>
            ) : null}
            <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
              {lang === 'en'
                ? 'This job is no longer active. No further actions are needed.'
                : 'Đơn hàng này đã bị hủy và không còn hiệu lực. Bạn không cần thực hiện thêm thao tác nào.'}
            </Text>
          </Card>
        )}

        {(job as any).sos_backup_searching && (
          <Card
            style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1.5, gap: 6 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#DC2626" />
              <Text style={{ fontWeight: '800', fontSize: fs(14.5), color: '#991B1B' }}>
                {t('helper_job.sos_replacement_accepted_title')}
              </Text>
            </View>
            <Text style={{ fontSize: fs(13), color: '#7F1D1D', lineHeight: Math.round(fs(19)) }}>
              {t('helper_job.sos_replacement_accepted_desc')}
            </Text>
          </Card>
        )}
        {/* ── Grab-Style Live Route & Map Navigation ─────────────────────── */}
        {/* P2-13: live map only while the job is active — never on open /
            finished / disputed / refunded jobs. */}
        {customerLocation &&
          [
            'confirmed',
            'helper_on_the_way',
            'helper_arrived',
            'in_progress',
            'pending_review',
          ].includes(job.status) && (
            <LiveTrackingMap
              customerLocation={customerLocation}
              helperLocation={helperLocation}
              helperRecordedAt={gps?.recorded_at}
              viewerRole="helper"
              onRouteMetrics={handleRouteMetrics}
              customerAddress={job.address?.full_address}
              helperName={lang === 'en' ? 'You (Helper)' : 'Bạn (Thợ)'}
              status={job.status}
              showNavigationButton={true}
              height={300}
            />
          )}

        {gpsError && job.status === 'helper_on_the_way' && (
          <Text accessibilityRole="alert" style={{ color: '#92400e' }}>
            {gpsError}
          </Text>
        )}
        {/* ── Job info ─────────────────────────────────────────────── */}
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Badge label={getJobServiceLabel(job)} />
            {job.is_fixed_price && (
              <Badge
                label={
                  lang === 'en'
                    ? `Fixed price: ${new Intl.NumberFormat('en-US').format(job.fixed_price ?? 0)}₫`
                    : `Giá cam kết ${new Intl.NumberFormat('vi-VN').format(job.fixed_price ?? 0)}₫`
                }
                color="#ECFDF5"
                textColor="#065F46"
              />
            )}
            {job.is_warranty && (
              <Badge label={t('helper_job.warranty_badge')} color="#FFFBEB" textColor="#92400E" />
            )}
            {job.preferred_date && (
              <Badge
                label={formatDate(job.preferred_date)}
                color={COLORS.gray[100]}
                textColor={COLORS.gray[700]}
              />
            )}
            {job.preferred_time_start && (
              <Badge
                label={job.preferred_time_start}
                color={COLORS.gray[100]}
                textColor={COLORS.gray[700]}
              />
            )}
          </View>
          <Text style={{ fontSize: fs(15), color: tc.text, lineHeight: 22, fontWeight: '500' }}>
            {job.description}
          </Text>
          {job.is_warranty && (
            <View
              style={{
                backgroundColor: '#FFFBEB',
                borderColor: '#FDE68A',
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                gap: 4,
              }}
            >
              <Text style={{ fontWeight: '700', fontSize: fs(14), color: '#92400E' }}>
                {t('helper_job.warranty_header')}
              </Text>
              <Text style={{ fontSize: fs(13), color: '#78350F', lineHeight: 18 }}>
                {lang === 'en' ? 'Scheduled: ' : 'Ngày hẹn: '}
                {job.preferred_date
                  ? formatDate(job.preferred_date)
                  : lang === 'en'
                    ? 'Earliest'
                    : 'Sớm nhất'}
                {job.preferred_time_start
                  ? ` ${lang === 'en' ? 'at' : 'lúc'} ${job.preferred_time_start}`
                  : ''}
              </Text>
            </View>
          )}
          <Separator my={4} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <MapPin size={16} color={COLORS.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontSize: fs(14),
                  color: tc.textSecondary,
                  lineHeight: 20,
                  fontWeight: '600',
                }}
              >
                {formatDisplayAddress(job.address)}
              </Text>
              {effectiveMetrics ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Navigation size={14} color={COLORS.primary} />
                  <Text style={{ fontSize: fs(13), color: COLORS.primary, fontWeight: '700' }}>
                    {lang === 'en'
                      ? `Distance: ~${effectiveMetrics.distanceKm.toFixed(1)} km · Est ETA: ~${effectiveMetrics.etaMinutes} mins`
                      : `Khoảng cách: ~${effectiveMetrics.distanceKm.toFixed(1)} km · ETA ước tính: ~${effectiveMetrics.etaMinutes} phút`}
                  </Text>
                </View>
              ) : (job as any)?.routing_error ? (
                <TouchableOpacity
                  onPress={() => refetchJob()}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                >
                  <AlertCircle size={14} color={COLORS.error || '#ef4444'} />
                  <Text
                    style={{
                      fontSize: fs(13),
                      color: COLORS.error || '#ef4444',
                      fontWeight: '600',
                      textDecorationLine: 'underline',
                    }}
                  >
                    {lang === 'en'
                      ? 'Route error · Tap to retry'
                      : 'Không lấy được tuyến đường · Bấm thử lại'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Card>

        {/* ── Customer info ─────────────────────────────────────────── */}
        {isMyActiveJob && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: COLORS.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(18) }}>K</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                {typeof job.customer_id === 'object' && job.customer_id
                  ? (job.customer_id as { full_name: string }).full_name
                  : lang === 'en'
                    ? 'Customer'
                    : 'Khách hàng'}
              </Text>
              <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
                {lang === 'en' ? 'Service requester' : 'Chủ đơn đặt dịch vụ'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: id } })}
              style={{ backgroundColor: COLORS.primaryLight, borderRadius: 14, padding: 10 }}
            >
              <MessageCircle size={20} color={COLORS.primary} />
            </TouchableOpacity>
            {/* ── Gọi thoại che số (Roadmap Phase 1) ─────────────────── */}
            {callConfig?.enabled && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/call/[jobId]',
                    params: {
                      jobId: id,
                      partnerName:
                        typeof job.customer_id === 'object' && job.customer_id
                          ? (job.customer_id as { full_name: string }).full_name
                          : lang === 'en'
                            ? 'Customer'
                            : 'Khách hàng',
                    },
                  })
                }
                style={{ backgroundColor: COLORS.primaryLight, borderRadius: 14, padding: 10 }}
              >
                <Phone size={20} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* ── Contract & Amendments Summary (for active helper job) ─── */}
        {isMyActiveJob && contract && (
          <Card style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                {t('helper_job_detail.contract_amendments_title')}
              </Text>
              <PriceText amount={contract.total_price} size={16} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                {t('helper_job_detail.estimated_payout', {
                  // S3: payout percent from the server-computed contract
                  // split, never a hardcoded 85%.
                  percent:
                    contract.total_price > 0
                      ? Math.round((contract.helper_receives / contract.total_price) * 100)
                      : 85,
                })}
              </Text>
              <PriceText amount={contract.helper_receives} size={14} color={COLORS.success} />
            </View>

            {Array.isArray(contract.amendments) && contract.amendments.length > 0 && (
              <View style={{ gap: 8, marginTop: 4 }}>
                {contract.amendments.map((am: any) => {
                  const addAmt =
                    (Number(am.additional_labor_cost) || 0) +
                    (Number(am.additional_materials_cost) || 0);
                  return (
                    <View
                      key={am._id}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        backgroundColor: tc.background,
                        borderWidth: 1,
                        borderColor: tc.border,
                        gap: 4,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.text }}>
                          +{new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(addAmt)}
                          ₫
                        </Text>
                        <Badge
                          label={
                            am.status === 'pending'
                              ? lang === 'en'
                                ? 'Awaiting customer'
                                : 'Chờ khách duyệt'
                              : am.status === 'accepted'
                                ? lang === 'en'
                                  ? 'Customer agreed'
                                  : 'Khách đã đồng ý'
                                : lang === 'en'
                                  ? 'Customer declined'
                                  : 'Khách từ chối'
                          }
                          color={
                            am.status === 'pending'
                              ? '#FEF3C7'
                              : am.status === 'accepted'
                                ? '#D1FAE5'
                                : '#FEE2E2'
                          }
                          textColor={
                            am.status === 'pending'
                              ? '#92400E'
                              : am.status === 'accepted'
                                ? '#065F46'
                                : '#991B1B'
                          }
                          size="sm"
                        />
                      </View>
                      <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                        {am.reason}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {canProposeAmendment && (
              <Button
                title={t('helper_job_detail.propose_amendment_btn')}
                variant="outline"
                size="sm"
                icon={<PlusCircle size={16} color={COLORS.primary} />}
                onPress={() => setShowAmendmentModal(true)}
              />
            )}
          </Card>
        )}

        {/* ── Đội nhóm đơn nhóm (Roadmap Phase 1) ────────────────────── */}
        <TeamCard job={job} currentUserId={currentUser?._id} />

        {/* ── Hồ sơ tranh chấp (Roadmap Phase 1) ─────────────────────── */}
        {(job.status === 'disputed' || (job as any).dispute_resolution) && (
          <Card
            style={{
              gap: 10,
              backgroundColor: '#FEF2F2',
              borderColor: '#FECACA',
              borderWidth: 1.5,
            }}
          >
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: '#991B1B' }}>
              {lang === 'en' ? 'Job has an open dispute' : 'Đơn đang có tranh chấp'}
            </Text>
            <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
              {lang === 'en'
                ? 'View dispute case history, provide additional evidence to Admin, and appeal if judgment is unsatisfactory.'
                : 'Xem toàn bộ diễn biến hồ sơ, bổ sung bằng chứng cho Admin và kháng cáo nếu phán quyết chưa thỏa đáng.'}
            </Text>
            <Button
              title={lang === 'en' ? 'View dispute file' : 'Xem hồ sơ tranh chấp'}
              variant="outline"
              onPress={() => router.push({ pathname: '/dispute/[jobId]', params: { jobId: id } })}
            />
          </Card>
        )}

        {/* ── Execution steps (active job) ──────────────────────────── */}
        {isMyActiveJob && (
          <Card style={{ gap: 16 }}>
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
              {t('helper_job_detail.update_progress_title')}
            </Text>

            {job.status === 'confirmed' && (
              <Button
                title={t('helper_job_detail.start_moving_btn')}
                loading={onTheWay.isPending}
                onPress={() => handleAction('on_the_way')}
              />
            )}
            {job.status === 'helper_on_the_way' && (
              <Button
                title={t('helper_job_detail.i_arrived_btn')}
                loading={arrived.isPending}
                onPress={() => handleAction('arrived')}
              />
            )}
            {job.status === 'helper_arrived' && (
              <Button
                title={t('helper_job_detail.start_work_btn')}
                loading={startJob.isPending}
                onPress={() => handleAction('start')}
              />
            )}
            {job.status === 'in_progress' && (
              <Button
                title={t('helper_job_detail.complete_work_btn')}
                loading={completeJob.isPending}
                onPress={() => handleAction('complete')}
              />
            )}
            {/* P1-15: backend also allows cancel at helper_arrived (with the
                late-cancel penalty branch) — same as the customer side. */}
            {['confirmed', 'helper_on_the_way', 'helper_arrived'].includes(job.status) && (
              <Button
                title={lang === 'en' ? 'Cancel job' : 'Hủy nhận đơn'}
                variant="outline"
                style={{ borderColor: '#FECACA', marginTop: 4 }}
                textStyle={{ color: '#DC2626' }}
                loading={cancelJobMutation.isPending}
                onPress={handleHelperCancelJob}
              />
            )}
            {job.status === 'pending_review' && (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                <Clock size={36} color={COLORS.gray[400]} />
                <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                  {lang === 'en'
                    ? 'Awaiting customer acceptance'
                    : 'Đang chờ khách hàng nghiệm thu'}
                </Text>
                <Text style={{ fontSize: fs(13), color: tc.textMuted, textAlign: 'center' }}>
                  {lang === 'en'
                    ? 'Customer will confirm and payout will be automatically credited to your wallet.'
                    : 'Khách hàng sẽ xác nhận và tiền công sẽ tự động cộng vào ví của bạn.'}
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* ── SOS Backup: thợ không thể tiếp tục đơn ─────────────────── */}
        <SosBackupHelperCard job={job} />

        {/* ── Quote status / Action ────────────────────────────────── */}
        {['open', 'receiving_quotes'].includes(job.status) && !isMyActiveJob && (
          <View>
            {isRejectedByMe ? (
              <Card
                style={{
                  backgroundColor: tc.subtle,
                  padding: 16,
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Ban size={20} color={COLORS.gray[700]} />
                <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'You declined this job offer' : 'Bạn đã từ chối đơn hàng này'}
                </Text>
                <Text style={{ fontSize: fs(12), color: tc.textMuted, textAlign: 'center' }}>
                  {lang === 'en'
                    ? 'Job has been hidden from your new job list and demand map.'
                    : 'Đơn đã được ẩn khỏi danh sách việc mới và bản đồ nhu cầu của bạn.'}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={unrejectJob.isPending}
                  onPress={async () => {
                    await unrejectJob.mutateAsync(id!);
                    Toast.show({
                      type: 'success',
                      text1:
                        lang === 'en'
                          ? 'Job unhidden, you can now submit a quote'
                          : 'Đã hoàn tác, bạn có thể gửi báo giá cho đơn này',
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: '#EFF6FF',
                    borderWidth: 1,
                    borderColor: '#BFDBFE',
                  }}
                >
                  <RotateCcw size={14} color="#1D4ED8" />
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: '#1D4ED8' }}>
                    {lang === 'en' ? 'Restore Job (Unhide)' : 'Hiện lại đơn này'}
                  </Text>
                </TouchableOpacity>
              </Card>
            ) : isDirectAcceptJob ? (
              <Card
                style={{
                  gap: 10,
                  backgroundColor: job.is_warranty ? '#FFFBEB' : '#ECFDF5',
                  borderColor: job.is_warranty ? '#FDE68A' : '#A7F3D0',
                  borderWidth: 1.5,
                }}
              >
                <Text style={{ fontWeight: '800', fontSize: fs(16), color: tc.text }}>
                  {job.is_warranty
                    ? t('helper_job.warranty_badge')
                    : lang === 'en'
                      ? `Fixed price: ${new Intl.NumberFormat('en-US').format(job.fixed_price ?? 0)}₫`
                      : `Giá cam kết: ${new Intl.NumberFormat('vi-VN').format(job.fixed_price ?? 0)}₫`}
                </Text>
                {job.is_warranty ? (
                  <Text style={{ fontSize: fs(13.5), color: tc.textSecondary, lineHeight: 20 }}>
                    {lang === 'en'
                      ? 'This is a free warranty job sent directly to you because you completed the original job. Warranty jobs do not charge labor — please support the customer during warranty period.'
                      : 'Đây là đơn bảo hành miễn phí, được gửi riêng cho bạn vì bạn đã thực hiện đơn gốc. Đơn bảo hành không tính tiền công — hãy hỗ trợ khách trong thời gian bảo hành nhé.'}
                  </Text>
                ) : (
                  <>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                        {lang === 'en'
                          ? `Net wallet payout (after ${hasFixedFee ? `${fixedFeePercent}%` : 'per-service'} platform fee):`
                          : `Thực nhận về ví (sau phí sàn ${hasFixedFee ? `${fixedFeePercent}%` : 'theo dịch vụ'}):`}
                      </Text>
                      <PriceText amount={fixedHelperReceives} size={15} color={COLORS.success} />
                    </View>
                    <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
                      {lang === 'en'
                        ? 'Fixed price jobs require no bidding — tap accept to confirm immediately at the price above.'
                        : 'Đơn giá cam kết không cần gửi báo giá — bấm nhận việc là chốt ngay với mức giá trên.'}
                    </Text>
                  </>
                )}
                <Button
                  title={
                    job.is_warranty
                      ? lang === 'en'
                        ? 'Accept warranty job'
                        : 'Nhận việc bảo hành'
                      : lang === 'en'
                        ? 'Accept job now'
                        : 'Nhận việc ngay'
                  }
                  icon={<CheckCircle2 size={16} color="#fff" />}
                  loading={acceptFixed.isPending}
                  onPress={handleAcceptDirect}
                />
                <Button
                  title={lang === 'en' ? 'Decline / Skip this job' : 'Từ chối / Bỏ qua đơn này'}
                  variant="outline"
                  loading={rejectJob.isPending}
                  onPress={handleRejectJob}
                />
              </Card>
            ) : myQuote ? (
              <Card
                style={{
                  backgroundColor: COLORS.successLight,
                  borderColor: '#A7F3D0',
                  borderWidth: 1.5,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} color={COLORS.success} />
                  <Text style={{ fontWeight: '800', fontSize: fs(15), color: COLORS.success }}>
                    {lang === 'en'
                      ? 'You submitted a quote for this job'
                      : 'Bạn đã gửi báo giá cho đơn này'}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                    {lang === 'en' ? 'Quoted labor price:' : 'Giá công đã báo:'}
                  </Text>
                  <PriceText amount={myQuote.total_price} size={16} />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                    {lang === 'en'
                      ? `Net wallet payout ${myQuoteFeePercent != null ? `(-${myQuoteFeePercent}%)` : '(fee per service)'}:`
                      : `Thực nhận về ví ${myQuoteFeePercent != null ? `(trừ ${myQuoteFeePercent}%)` : '(phí theo dịch vụ)'}:`}
                  </Text>
                  <PriceText amount={myQuote.helper_receives} size={15} color={COLORS.success} />
                </View>
                <Text
                  style={{
                    fontSize: fs(12),
                    color: tc.textMuted,
                    marginTop: 2,
                    fontStyle: 'italic',
                  }}
                >
                  {lang === 'en'
                    ? 'Waiting for customer review and selection.'
                    : 'Đang chờ khách hàng xem xét và lựa chọn bạn.'}
                </Text>
                <Button
                  title={lang === 'en' ? 'Decline / Skip this job' : 'Từ chối / Bỏ qua đơn này'}
                  variant="outline"
                  loading={rejectJob.isPending}
                  onPress={handleRejectJob}
                  style={{ marginTop: 6 }}
                />
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                <Button
                  title={lang === 'en' ? 'Send quote to customer' : 'Gửi báo giá cho khách'}
                  onPress={handleOpenQuoteModal}
                  icon={<DollarSign size={18} color="#fff" />}
                />
                <Button
                  title={lang === 'en' ? 'Decline / Skip this job' : 'Từ chối / Bỏ qua đơn này'}
                  variant="outline"
                  loading={rejectJob.isPending}
                  onPress={handleRejectJob}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* A76: Modal xác nhận hủy nhận việc của thợ */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!cancelJobMutation.isPending) setShowCancelModal(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(17,24,39,0.5)',
            padding: 20,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: tc.surface,
              borderRadius: 14,
              padding: 20,
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
                {lang === 'en' ? 'Cancel Assigned Job' : 'Hủy nhận công việc'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                disabled={cancelJobMutation.isPending}
              >
                <X size={22} color={COLORS.gray[500]} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
              {lang === 'en'
                ? 'Cancelling after accepting may affect your completion rate. Please provide a clear reason.'
                : 'Việc hủy đơn sau khi đã nhận có thể ảnh hưởng đến điểm uy tín và tỷ lệ hoàn thành. Vui lòng cung cấp lý do rõ ràng.'}
            </Text>

            {/* Quick Reason Chips */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.text }}>
                {lang === 'en' ? 'Cancellation reason (required) *' : 'Lý do hủy đơn (bắt buộc) *'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[
                  lang === 'en' ? 'Personal emergency' : 'Việc gia đình đột xuất',
                  lang === 'en' ? 'Vehicle / tool breakdown' : 'Hỏng xe / công cụ làm việc',
                  lang === 'en' ? 'Schedule conflict' : 'Trùng lịch công việc',
                  lang === 'en' ? 'Customer unreachable' : 'Không liên hệ được khách hàng',
                  lang === 'en' ? 'Other reason' : 'Lý do khác',
                ].map(r => {
                  const sel = cancelReasonChip === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setCancelReasonChip(sel ? '' : r)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: sel ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: sel ? COLORS.primaryLight : COLORS.gray[50],
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fs(12),
                          fontWeight: sel ? '700' : '500',
                          color: sel ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: tc.border,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: fs(13.5),
                  color: tc.text,
                  minHeight: 54,
                  textAlignVertical: 'top',
                }}
                placeholder={
                  lang === 'en' ? 'Enter detailed reason...' : 'Nhập chi tiết lý do hủy việc...'
                }
                placeholderTextColor={COLORS.gray[400]}
                value={cancelReasonText}
                onChangeText={setCancelReasonText}
                multiline
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Button
                title={lang === 'en' ? 'Keep Job' : 'Giữ đơn'}
                variant="outline"
                style={{ flex: 1 }}
                disabled={cancelJobMutation.isPending}
                onPress={() => setShowCancelModal(false)}
              />
              <Button
                title={lang === 'en' ? 'Confirm Cancel' : 'Xác nhận hủy'}
                variant="danger"
                style={{ flex: 1 }}
                loading={cancelJobMutation.isPending}
                disabled={!cancelReasonChip && !cancelReasonText.trim()}
                onPress={handleConfirmHelperCancel}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Propose Contract Amendment Modal ──────────────────────────── */}
      <Modal
        visible={showAmendmentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAmendmentModal(false)}
      >
        <View
          style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowAmendmentModal(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: fs(18),
                fontWeight: '800',
                marginLeft: 12,
                color: tc.text,
              }}
            >
              {lang === 'en' ? 'Propose Cost Addendum' : 'Đề xuất phụ lục phát sinh'}
            </Text>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
              <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                <Text style={{ fontWeight: '800', fontSize: fs(13.5), color: COLORS.primaryDark }}>
                  {lang === 'en'
                    ? 'Transparent Costs & Additional Materials'
                    : 'Minh bạch chi phí & Vật tư ngoài'}
                </Text>
                <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 18 }}>
                  {lang === 'en'
                    ? 'If you need to purchase extra parts/materials or encounter unexpected work, submit a proposal for customer approval on app before proceeding.'
                    : 'Nếu cần mua thêm vật tư/linh kiện hoặc phát sinh khối lượng công việc ngoài dự kiến, hãy gửi đề xuất để khách bấm Đồng ý trên ứng dụng trước khi thực hiện.'}
                </Text>
              </Card>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en'
                    ? 'Additional parts / materials cost (₫)'
                    : 'Tiền vật tư / linh kiện phát sinh (₫)'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(18),
                    fontWeight: '700',
                    color: tc.text,
                  }}
                  placeholder={lang === 'en' ? 'E.g., 150000' : 'VD: 150000'}
                  value={amendMaterialsCost}
                  onChangeText={setAmendMaterialsCost}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'Extra labor fee (₫)' : 'Tiền công làm thêm (₫)'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(18),
                    fontWeight: '700',
                    color: tc.text,
                  }}
                  placeholder={lang === 'en' ? 'E.g., 100000' : 'VD: 100000'}
                  value={amendLaborCost}
                  onChangeText={setAmendLaborCost}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en'
                    ? 'Reason & details of additional items *'
                    : 'Lý do & Chi tiết hạng mục phát sinh *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(15),
                    minHeight: 90,
                    textAlignVertical: 'top',
                    color: tc.text,
                  }}
                  placeholder={
                    lang === 'en'
                      ? 'E.g., Replacement 35uF AC capacitor + R32 gas refill...'
                      : 'VD: Thay mới tụ đề máy lạnh 35uF + nạp bổ sung gas R32...'
                  }
                  value={amendReason}
                  onChangeText={setAmendReason}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title={
                  lang === 'en'
                    ? 'Send proposal for customer approval'
                    : 'Gửi đề xuất cho khách duyệt'
                }
                loading={proposeAmendment.isPending}
                onPress={handleSubmitAmendment}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Quote Modal ───────────────────────────────────────────────── */}
      <Modal visible={showQuoteModal} animationType="slide" presentationStyle="pageSheet">
        <View
          style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowQuoteModal(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: fs(18),
                fontWeight: '800',
                marginLeft: 12,
                color: tc.text,
              }}
            >
              {t('helper_job.quote_modal_title')}
            </Text>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {t('helper_job.labor_price_label')}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(22),
                    fontWeight: '800',
                    color: tc.text,
                  }}
                  placeholder={lang === 'en' ? 'E.g., 300000' : 'VD: 300000'}
                  value={laborCost}
                  onChangeText={setLaborCost}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
                {laborCost !== '' && Number(laborCost) < 50000 && (
                  <Text
                    style={{
                      fontSize: fs(12),
                      color: COLORS.error,
                      fontWeight: '600',
                      marginTop: 4,
                    }}
                  >
                    {t('helper_job.min_quote_warning')} (
                    {lang === 'en' ? 'current: ' : 'hiện tại: '}
                    {Number(laborCost).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')}₫)
                  </Text>
                )}
              </View>

              {total > 0 && (
                <Card style={{ backgroundColor: COLORS.primaryLight, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: tc.textSecondary, fontWeight: '600' }}>
                      {t('helper_job.cust_pays')}
                    </Text>
                    <PriceText amount={total} size={14} color={COLORS.gray[900]} bold={false} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: tc.textMuted, fontWeight: '500' }}>
                      {quoteServiceObj?.platform_fee_percent != null
                        ? lang === 'en'
                          ? `Platform fee (${quoteFeePercent}%)`
                          : `Phí nền tảng (${quoteFeePercent}%)`
                        : lang === 'en'
                          ? 'Platform fee (per service)'
                          : 'Phí sàn (theo dịch vụ)'}
                    </Text>
                    <PriceText
                      amount={platformFee}
                      size={14}
                      color={COLORS.gray[500]}
                      bold={false}
                    />
                  </View>
                  <Separator my={4} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800', color: tc.text }}>
                      {t('helper_job.net_payout')}
                    </Text>
                    <PriceText amount={helperReceives} size={17} />
                  </View>
                </Card>
              )}

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {t('helper_job.est_hours')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {[1, 2, 3, 4, 5, 6, 8].map(h => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setEstimatedDuration(String(h))}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor:
                          estimatedDuration === String(h) ? COLORS.primary : COLORS.gray[200],
                        backgroundColor:
                          estimatedDuration === String(h) ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          color:
                            estimatedDuration === String(h) ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {h}h
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {t('helper_job.quote_notes_label')}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(15),
                    minHeight: 80,
                    textAlignVertical: 'top',
                    color: tc.text,
                  }}
                  placeholder={t('helper_job.quote_notes_placeholder')}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title={t('helper_job.submit_quote_btn')}
                loading={submitQuote.isPending}
                disabled={!laborCost || Number(laborCost) < 50000 || submitQuote.isPending}
                onPress={handleSubmitQuote}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Complete Evidence Modal (Chụp ảnh / Quay video hoàn thành) ── */}
      <Modal visible={showCompleteModal} animationType="slide" presentationStyle="pageSheet">
        <View
          style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: tc.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowCompleteModal(false)}>
                <X size={24} color={COLORS.gray[700]} />
              </TouchableOpacity>
              <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
                {t('helper_job.evidence_title')}
              </Text>
            </View>
            <Badge
              label={t('helper_job.evidence_badge')}
              color={COLORS.primaryLight}
              textColor={COLORS.primary}
            />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }}>
              <View
                style={{
                  backgroundColor: COLORS.primaryLight,
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#FFD9C5',
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color={COLORS.primary} />
                  <Text style={{ fontWeight: '800', fontSize: fs(14), color: COLORS.primaryDark }}>
                    {t('helper_job.evidence_sub')}
                  </Text>
                </View>
                <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 18 }}>
                  {t('helper_job.evidence_hint')}
                </Text>
              </View>

              {/* ── 1. Photos Section ─────────────────────────────────── */}
              <View style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                    {t('helper_job.evidence_photos_count', { count: completionPhotos.length })}
                  </Text>
                  <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                    {t('helper_job.evidence_max_photos')}
                  </Text>
                </View>

                {/* Photo Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleTakePhoto}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: '#FFF4ED',
                      borderWidth: 1.5,
                      borderColor: COLORS.primary,
                      borderRadius: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Camera size={18} color={COLORS.primary} />
                    <Text style={{ fontWeight: '700', fontSize: fs(13.5), color: COLORS.primary }}>
                      {t('helper_job.evidence_take_photo')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickPhoto}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: tc.subtle,
                      borderRadius: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <ImagePlus size={18} color={COLORS.gray[700]} />
                    <Text style={{ fontWeight: '700', fontSize: fs(13.5), color: tc.text }}>
                      {t('helper_job.evidence_pick_album')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Photos Grid */}
                {completionPhotos.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                    {completionPhotos.map((uri, index) => (
                      <View
                        key={`photo-${index}`}
                        style={{
                          width: '30%',
                          aspectRatio: 1,
                          borderRadius: 14,
                          overflow: 'hidden',
                          position: 'relative',
                          borderWidth: 1,
                          borderColor: tc.border,
                        }}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() =>
                            setCompletionPhotos(prev => prev.filter((_, i) => i !== index))
                          }
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            width: 24,
                            height: 24,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={13} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* ── 2. Videos Section ─────────────────────────────────── */}
              <View style={{ gap: 10, marginTop: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                    {t('helper_job.evidence_videos_count', { count: completionVideos.length })}
                  </Text>
                  <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                    {t('helper_job.evidence_video_limit')}
                  </Text>
                </View>

                {/* Video Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleRecordVideo}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: '#EEF4FE',
                      borderWidth: 1.5,
                      borderColor: COLORS.secondary,
                      borderRadius: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Video size={18} color={COLORS.secondary} />
                    <Text
                      style={{ fontWeight: '700', fontSize: fs(13.5), color: COLORS.secondary }}
                    >
                      {lang === 'en' ? 'Record video' : 'Quay video'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickVideo}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: tc.subtle,
                      borderRadius: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Video size={18} color={COLORS.gray[700]} />
                    <Text style={{ fontWeight: '700', fontSize: fs(13.5), color: tc.text }}>
                      {t('helper_job.evidence_pick_video')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Videos List Preview */}
                {completionVideos.length > 0 && (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {completionVideos.map((uri, index) => (
                      <View
                        key={`video-${index}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: tc.background,
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: tc.border,
                        }}
                      >
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              backgroundColor: '#EEF4FE',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Video size={18} color={COLORS.secondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: fs(13),
                                fontWeight: '700',
                                color: tc.text,
                              }}
                              numberOfLines={1}
                            >
                              {lang === 'en'
                                ? `Acceptance video #${index + 1}`
                                : `Video nghiệm thu #${index + 1}`}
                            </Text>
                            <Text style={{ fontSize: fs(11), color: tc.textMuted }}>
                              {lang === 'en'
                                ? 'Ready to send to customer'
                                : 'Đã sẵn sàng gửi cho khách'}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            setCompletionVideos(prev => prev.filter((_, i) => i !== index))
                          }
                          style={{
                            padding: 6,
                            borderRadius: 8,
                            backgroundColor: '#FEE2E2',
                          }}
                        >
                          <Trash2 size={16} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* ── 3. Notes Section ──────────────────────────────────── */}
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary, fontSize: fs(13.5) }}>
                  {t('helper_job.evidence_notes_label')}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(14),
                    minHeight: 80,
                    textAlignVertical: 'top',
                    color: tc.text,
                  }}
                  placeholder={t('helper_job.evidence_notes_placeholder')}
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title={t('helper_job.evidence_submit_btn')}
                loading={completeJob.isPending}
                onPress={handleCompleteSubmission}
                style={{ marginTop: 10 }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
