const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testFullAiFlow() {
  const apiKey = 'AIzaSyBJS3LEtqmSgGRnR8ecRt1XFd3EKQlLmW8';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `Bạn là trợ lý đặt lịch giúp việc nhà HomeMate. Phân tích yêu cầu của khách và trả về JSON chuẩn xác:
{
  "service_type": string (housekeeping_hourly | housekeeping_daily | deep_cleaning | cooking | electrician | plumbing | ac_repair),
  "service_name": string,
  "estimated_duration_hours": number,
  "num_workers": number,
  "tasks": string[],
  "price_min": number (VND),
  "price_max": number (VND),
  "confidence": number,
  "notes": string
}`,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const testPrompts = [
    'Nhà mình 3 tầng ở Quận 1 cần tổng vệ sinh sạch sẽ đón Tết vào cuối tuần này',
    'Cần 1 chị nấu ăn bữa tối cho 4 người và rửa bát dọn bếp lúc 5h chiều nay',
    'Máy lạnh phòng ngủ bị chảy nước và không lạnh cần thợ qua sửa gấp',
  ];

  for (const text of testPrompts) {
    console.log(`\n======================================================`);
    console.log(`📝 YÊU CẦU: "${text}"`);
    console.log(`======================================================`);
    try {
      const result = await model.generateContent(text);
      const jsonText = result.response.text();
      const parsed = JSON.parse(jsonText);
      console.log('🤖 KẾT QUẢ PHÂN TÍCH TỪ GEMINI 2.5 FLASH:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error('Lỗi phân tích:', e);
    }
  }
}

testFullAiFlow();
