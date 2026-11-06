// Khai báo module cho file CSS import side-effect (NativeWind global.css).
// Sửa lỗi TS2882: Cannot find module or type declarations for '../global.css'.
// (nativewind-env.d.ts là file generated, không sửa nó — khai báo riêng ở đây.)
declare module '*.css';
