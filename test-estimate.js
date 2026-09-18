const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testEstimate() {
  const apiKey = 'AIzaSyBJS3LEtqmSgGRnR8ecRt1XFd3EKQlLmW8';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `Bạn là chuyên gia định giá dịch vụ gia đình và sửa chữa HomeMate (Vua Thợ) tại Việt Nam.
Phân tích mô tả công việc và ước tính khoảng giá thị trường hợp lý.

Bảng giá tham khảo (VND):
- Giúp việc theo giờ: 45,000 - 80,000/giờ
- Tổng vệ sinh nhà cửa: 800,000 - 2,500,000/lần
- Nấu ăn gia đình: 60,000 - 120,000/giờ
- Sửa điện gia dụng: 150,000 - 500,000/lần
- Sửa ống nước, thông cống: 150,000 - 600,000/lần
- Vệ sinh & Sửa máy lạnh: 180,000 - 550,000/máy
- Sửa máy giặt, tủ lạnh: 200,000 - 700,000/lần
- Sửa khóa & Lắp camera: 150,000 - 500,000/lần

Trả về JSON:
{
  "service_type": string,
  "price_min": number,
  "price_max": number,
  "estimated_duration_hours": number,
  "num_workers": number,
  "complexity": "easy" | "medium" | "hard",
  "reasoning": string,
  "tasks": string[],
  "confidence": number
}`,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  try {
    const result = await model.generateContent('Loại dịch vụ: Vệ sinh & Sửa máy lạnh\nMô tả: Vệ sinh 2 máy lạnh Daikin 1.5HP ở phòng ngủ và nạp thêm gas r32');
    console.log('Result:', result.response.text());
  } catch (e) {
    console.error('Error in estimate:', e);
  }
}

testEstimate();
