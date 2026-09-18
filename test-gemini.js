const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const apiKey = 'AIzaSyBJS3LEtqmSgGRnR8ecRt1XFd3EKQlLmW8';
  console.log('Testing Gemini 2.5 Flash with Key:', apiKey.substring(0, 10) + '...');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const prompt = 'Xin chào, hãy giới thiệu ngắn gọn về trợ lý AI của HomeMate trong 1 câu.';
    const result = await model.generateContent(prompt);
    console.log('\n--- SUCCESS RESPONSE FROM GEMINI 2.5 FLASH ---');
    console.log(result.response.text());
    console.log('----------------------------------------------\n');
  } catch (err) {
    console.error('\n--- GEMINI ERROR ---');
    console.error(err.message || err);
    console.error('--------------------\n');
  }
}

testGemini();
