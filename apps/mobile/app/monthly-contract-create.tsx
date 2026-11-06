import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useFavorites, useAddresses, useServices, useCreateMonthlyContract } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { Avatar, Button, Card, COLORS, LoadingSpinner } from '@/components/ui';

// Thứ hiển thị T2..CN → giá trị JS Date.getDay(): T2=1 … T7=6, CN=0
const DAY_OPTIONS_VI = [
  { label: 'T2', value: 1 },
  { label: 'T3', value: 2 },
  { label: 'T4', value: 3 },
  { label: 'T5', value: 4 },
  { label: 'T6', value: 5 },
  { label: 'T7', value: 6 },
  { label: 'CN', value: 0 },
];
const DAY_OPTIONS_EN = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const DEFAULT_COORDS: [number, number] = [106.6983, 10.7725]; // TP.HCM — như flow đặt việc

export default function MonthlyContractCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ helperId?: string }>();
  const { t, fs, lang, tService } = useTranslation();

  const { data: favorites, isLoading: favLoading } = useFavorites();
  const { data: addresses } = useAddresses();
  const { data: services } = useServices();
  const create = useCreateMonthlyContract();

  const [helperId, setHelperId] = useState<string | undefined>(params.helperId);
  const [serviceId, setServiceId] = useState<string | undefined>();
  const [title, setTitle] = useState(lang === 'en' ? 'Monthly Home Helper' : 'Giúp việc nhà theo tháng');
  const [salary, setSalary] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('17:00');
  const [startDate, setStartDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState('');
  const [addressIdx, setAddressIdx] = useState(0);
  const [fullAddress, setFullAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState(lang === 'en' ? 'Ho Chi Minh' : 'Hồ Chí Minh');

  // Địa chỉ đã lưu: chọn sẵn địa chỉ mặc định/đầu tiên nếu có
  const savedAddresses: any[] = useMemo(() => {
    const list = (addresses as any)?.addresses ?? addresses ?? [];
    return Array.isArray(list) ? list : [];
  }, [addresses]);

  useEffect(() => {
    if (savedAddresses.length > 0) {
      const def = savedAddresses.findIndex((a: any) => a.is_default);
      setAddressIdx(def >= 0 ? def : 0);
    }
  }, [savedAddresses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAddress = savedAddresses[addressIdx];

  const favoriteHelpers = useMemo(
    () =>
      (favorites ?? []).map(f => {
        const h = typeof f.helper_id === 'object' ? f.helper_id : null;
        return {
          id: h?._id ?? String(f.helper_id),
          name: h?.full_name ?? (lang === 'en' ? 'Helper' : 'Thợ'),
          avatar: h?.avatar,
          rating: f.helper_profile?.rating,
        };
      }),
    [favorites, lang],
  );

  const scrollRef = useRef<ScrollView>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (f: string) => {
    setFieldErrors(prev => {
      if (!prev[f]) return prev;
      const next = { ...prev };
      delete next[f];
      return next;
    });
  };

  const toggleDay = (v: number) => {
    clearFieldError('days');
    setDays(prev => (prev.includes(v) ? prev.filter(d => d !== v) : [...prev, v]));
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!helperId) {
      errors.helperId =
        lang === 'en' ? 'Please select a helper from favorites' : 'Vui lòng chọn thợ từ danh sách yêu thích';
    }
    const salaryNum = Number(salary.replace(/[^\d]/g, ''));
    if (!salaryNum || salaryNum < 100000) {
      errors.salary = lang === 'en' ? 'Minimum monthly salary is 100,000₫' : 'Lương tháng tối thiểu 100.000₫';
    }
    if (days.length === 0) {
      errors.days =
        lang === 'en'
          ? 'Please select at least 1 working day in week'
          : 'Vui lòng chọn ít nhất 1 ngày làm việc trong tuần';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      errors.startDate =
        lang === 'en' ? 'Start date must be in YYYY-MM-DD format' : 'Ngày bắt đầu phải có dạng YYYY-MM-DD';
    }
    if (endDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
      errors.endDate =
        lang === 'en' ? 'End date must be in YYYY-MM-DD format' : 'Ngày kết thúc phải có dạng YYYY-MM-DD';
    }

    // Ưu tiên địa chỉ đã lưu (có sẵn tọa độ); nếu nhập tay thì dùng tọa độ
    // mặc định TP.HCM như flow đặt việc hiện tại.
    const address = selectedAddress
      ? {
          full_address: selectedAddress.full_address,
          ward: selectedAddress.ward || undefined,
          district: selectedAddress.district,
          city: selectedAddress.city,
          notes: selectedAddress.notes || undefined,
          location: {
            type: 'Point',
            coordinates: selectedAddress.location?.coordinates ?? DEFAULT_COORDS,
          },
        }
      : {
          full_address: fullAddress.trim(),
          district: district.trim(),
          city: city.trim() || 'Hồ Chí Minh',
          location: { type: 'Point', coordinates: DEFAULT_COORDS },
        };
    if (!address.full_address || !address.district) {
      errors.address =
        lang === 'en' ? 'Please enter full work address' : 'Vui lòng nhập đầy đủ địa chỉ làm việc';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setFieldErrors({});

    try {
      const created: any = await create.mutateAsync({
        helper_id: helperId,
        service_id: serviceId || undefined,
        title: title.trim() || (lang === 'en' ? 'Monthly Home Helper' : 'Giúp việc nhà theo tháng'),
        monthly_salary: salaryNum,
        address,
        schedule: { days_of_week: days, time_start: timeStart, time_end: timeEnd },
        start_date: startDate.trim(),
        end_date: endDate.trim() || undefined,
      });
      const newId = created?.data?.data?._id ?? created?.data?._id;
      if (newId) {
        router.replace({ pathname: '/monthly-contract/[id]', params: { id: String(newId) } });
      } else {
        router.replace('/monthly-contracts');
      }
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fs(14),
    backgroundColor: '#fff',
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/monthly-contracts')
          }
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fs(18), fontWeight: '800', color: COLORS.gray[900] }}>
            {lang === 'en' ? 'Hire Helper by Month' : 'Thuê giúp việc theo tháng'}
          </Text>
          <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
            {lang === 'en' ? 'Helper will review the contract before it takes effect' : 'Thợ sẽ duyệt hợp đồng trước khi có hiệu lực'}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 130 }}
      >
        {/* ── Chọn thợ ── */}
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.gray[900] }}>
            {lang === 'en' ? '1. Select helper (from favorites)' : '1. Chọn thợ (từ danh sách yêu thích)'}
          </Text>
          {favLoading ? (
            <LoadingSpinner size="small" />
          ) : favoriteHelpers.length === 0 && !params.helperId ? (
            <Text style={{ fontSize: fs(13), color: COLORS.gray[500], lineHeight: 19 }}>
              {lang === 'en'
                ? 'You have no favorite helpers yet. Save helpers to your favorites from their profile or completed jobs, then return to create contract.'
                : 'Bạn chưa có thợ yêu thích nào. Hãy lưu thợ vào danh sách yêu thích từ trang hồ sơ thợ hoặc từ đơn đã hoàn thành, rồi quay lại tạo hợp đồng.'}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {params.helperId && !favoriteHelpers.some(h => h.id === params.helperId) && (
                <HelperRow
                  name={lang === 'en' ? 'Helper selected from profile' : 'Thợ đã chọn từ hồ sơ'}
                  selected={helperId === params.helperId}
                  onPress={() => {
                    setHelperId(params.helperId);
                    clearFieldError('helperId');
                  }}
                />
              )}
              {favoriteHelpers.map(h => (
                <HelperRow
                  key={h.id}
                  name={h.name}
                  avatar={h.avatar}
                  rating={h.rating}
                  selected={helperId === h.id}
                  onPress={() => {
                    setHelperId(h.id);
                    clearFieldError('helperId');
                  }}
                />
              ))}
            </View>
          )}
          {fieldErrors.helperId && (
            <Text style={{ fontSize: fs(12), color: COLORS.error, marginTop: 2 }}>
              {fieldErrors.helperId}
            </Text>
          )}
        </Card>

        {/* ── Công việc & lương ── */}
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.gray[900] }}>
            {lang === 'en' ? '2. Job details & monthly wage' : '2. Công việc & lương tháng'}
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={lang === 'en' ? 'Contract title' : 'Tên hợp đồng'}
            style={inputStyle}
          />
          {(services ?? []).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(services ?? []).slice(0, 8).map((s: any) => (
                <Chip
                  key={s._id}
                  label={tService(s)}
                  selected={serviceId === s._id}
                  onPress={() => setServiceId(serviceId === s._id ? undefined : s._id)}
                />
              ))}
            </View>
          )}
          <TextInput
            value={salary}
            onChangeText={v => {
              setSalary(v);
              clearFieldError('salary');
            }}
            placeholder={lang === 'en' ? 'Monthly wage (VND), e.g. 8000000' : 'Lương tháng (VNĐ), VD: 8000000'}
            keyboardType="numeric"
            style={[inputStyle, fieldErrors.salary ? { borderColor: COLORS.error } : null]}
          />
          {fieldErrors.salary && (
            <Text style={{ fontSize: fs(12), color: COLORS.error, marginTop: -4 }}>
              {fieldErrors.salary}
            </Text>
          )}
          <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
            {lang === 'en'
              ? 'At month end, actual wage = monthly salary × (verified sessions / scheduled sessions), minus 15% platform fee.'
              : 'Cuối tháng, lương thực trả = lương tháng × (số buổi đã xác nhận / tổng số buổi theo lịch), trừ phí sàn 15%.'}
          </Text>
        </Card>

        {/* ── Lịch làm việc ── */}
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.gray[900] }}>
            {lang === 'en' ? '3. Weekly schedule' : '3. Lịch làm việc hằng tuần'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(lang === 'en' ? DAY_OPTIONS_EN : DAY_OPTIONS_VI).map(d => (
              <Chip
                key={d.label}
                label={d.label}
                selected={days.includes(d.value)}
                onPress={() => toggleDay(d.value)}
              />
            ))}
          </View>
          {fieldErrors.days && (
            <Text style={{ fontSize: fs(12), color: COLORS.error, marginTop: -4 }}>
              {fieldErrors.days}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: fs(12.5), color: COLORS.gray[500] }}>
                {lang === 'en' ? 'Start time' : 'Giờ bắt đầu'}
              </Text>
              <TextInput
                value={timeStart}
                onChangeText={setTimeStart}
                placeholder="08:00"
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: fs(12.5), color: COLORS.gray[500] }}>
                {lang === 'en' ? 'End time' : 'Giờ kết thúc'}
              </Text>
              <TextInput
                value={timeEnd}
                onChangeText={setTimeEnd}
                placeholder="17:00"
                style={inputStyle}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: fs(12.5), color: COLORS.gray[500] }}>
                {lang === 'en' ? 'Start date (YYYY-MM-DD)' : 'Ngày bắt đầu (YYYY-MM-DD)'}
              </Text>
              <TextInput
                value={startDate}
                onChangeText={v => {
                  setStartDate(v);
                  clearFieldError('startDate');
                }}
                style={[inputStyle, fieldErrors.startDate ? { borderColor: COLORS.error } : null]}
              />
              {fieldErrors.startDate && (
                <Text style={{ fontSize: fs(11.5), color: COLORS.error, marginTop: 2 }}>
                  {fieldErrors.startDate}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: fs(12.5), color: COLORS.gray[500] }}>
                {lang === 'en' ? 'End date (optional)' : 'Ngày kết thúc (không bắt buộc)'}
              </Text>
              <TextInput
                value={endDate}
                onChangeText={v => {
                  setEndDate(v);
                  clearFieldError('endDate');
                }}
                placeholder={lang === 'en' ? 'Empty = ongoing' : 'Để trống = lâu dài'}
                style={[inputStyle, fieldErrors.endDate ? { borderColor: COLORS.error } : null]}
              />
              {fieldErrors.endDate && (
                <Text style={{ fontSize: fs(11.5), color: COLORS.error, marginTop: 2 }}>
                  {fieldErrors.endDate}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* ── Địa chỉ ── */}
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: fs(15), fontWeight: '800', color: COLORS.gray[900] }}>
            {lang === 'en' ? '4. Work address' : '4. Địa chỉ làm việc'}
          </Text>
          {savedAddresses.length > 0 ? (
            <View style={{ gap: 8 }}>
              {savedAddresses.map((a: any, i: number) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => {
                    setAddressIdx(i);
                    clearFieldError('address');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: addressIdx === i ? COLORS.primary : COLORS.gray[200],
                    backgroundColor: addressIdx === i ? COLORS.primaryLight : '#fff',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fs(13.5), fontWeight: '700', color: COLORS.gray[800] }}>
                      {a.label || (lang === 'en' ? 'Address' : 'Địa chỉ')} {a.is_default ? (lang === 'en' ? '· Default' : '· Mặc định') : ''}
                    </Text>
                    <Text style={{ fontSize: fs(12.5), color: COLORS.gray[600] }}>
                      {a.full_address}, {a.district}, {a.city}
                    </Text>
                  </View>
                  {addressIdx === i && <Check size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <TextInput
                value={fullAddress}
                onChangeText={v => {
                  setFullAddress(v);
                  clearFieldError('address');
                }}
                placeholder={lang === 'en' ? 'Full address (street, number...)' : 'Địa chỉ đầy đủ (số nhà, đường…)'}
                style={[inputStyle, fieldErrors.address ? { borderColor: COLORS.error } : null]}
              />
              <TextInput
                value={district}
                onChangeText={v => {
                  setDistrict(v);
                  clearFieldError('address');
                }}
                placeholder={lang === 'en' ? 'District' : 'Quận / Huyện'}
                style={[inputStyle, fieldErrors.address ? { borderColor: COLORS.error } : null]}
              />
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder={lang === 'en' ? 'Province / City' : 'Tỉnh / Thành phố'}
                style={inputStyle}
              />
            </View>
          )}
          {fieldErrors.address && (
            <Text style={{ fontSize: fs(12), color: COLORS.error, marginTop: 2 }}>
              {fieldErrors.address}
            </Text>
          )}
        </Card>

        <Button
          title={lang === 'en' ? 'Send contract proposal to helper' : 'Gửi đề nghị hợp đồng cho thợ'}
          loading={create.isPending}
          onPress={handleSubmit}
        />
        <Text
          style={{ fontSize: fs(12), color: COLORS.gray[500], textAlign: 'center', lineHeight: 18 }}
        >
          {lang === 'en'
            ? 'Contract takes effect only after helper agrees. You can cancel anytime before finalizing first month wages.'
            : 'Hợp đồng chỉ có hiệu lực sau khi thợ đồng ý. Bạn có thể hủy bất cứ lúc nào trước khi chốt lương tháng đầu tiên.'}
        </Text>
      </ScrollView>
    </View>
  );
}

function HelperRow({
  name,
  avatar,
  rating,
  selected,
  onPress,
}: {
  name: string;
  avatar?: string;
  rating?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { fs } = useTranslation();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.primary : COLORS.gray[200],
        backgroundColor: selected ? COLORS.primaryLight : '#fff',
      }}
    >
      <Avatar uri={avatar} name={name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fs(14), fontWeight: '700', color: COLORS.gray[900] }}>{name}</Text>
        {rating ? (
          <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>⭐ {rating.toFixed(1)}</Text>
        ) : null}
      </View>
      {selected && <Check size={18} color={COLORS.primary} />}
    </TouchableOpacity>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { fs } = useTranslation();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.primary : COLORS.gray[200],
        backgroundColor: selected ? COLORS.primary : '#fff',
      }}
    >
      <Text
        style={{ fontSize: fs(13), fontWeight: '700', color: selected ? '#fff' : COLORS.gray[700] }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
