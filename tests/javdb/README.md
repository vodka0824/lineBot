# JavDB 番號查詢測試模組

⚠️ **警告**: 此模組僅供技術測試用途，請勿用於商業或公開服務。

## 📋 功能說明

輸入番號 → 返回 AV 封面圖片 URL

**範例**:
```
輸入: SSIS-001
輸出: 封面圖片 URL、標題、詳情連結
```

---

## 🚀 快速開始

### 測試單一番號

```bash
cd tests/javdb
node javdb-test.js SSIS-001
```

### 測試多個番號

```bash
node javdb-test.js SSIS-001 ABP-123 STARS-456
```

---

## 📁 檔案結構

```
tests/javdb/
├── javdb-api.js      # 核心 API 模組
├── javdb-test.js     # 測試腳本
└── README.md         # 說明文件（本檔案）
```

---

## 🔧 API 使用

### 基本使用

```javascript
const { searchByCode } = require('./javdb-api');

// 查詢番號
const result = await searchByCode('SSIS-001');

if (result.success) {
    console.log('封面 URL:', result.data.coverUrl);
    console.log('標題:', result.data.title);
} else {
    console.log('錯誤:', result.error);
}
```

### 批次查詢

```javascript
const { batchSearch } = require('./javdb-api');

const codes = ['SSIS-001', 'ABP-123', 'STARS-456'];
const results = await batchSearch(codes, 1000); // 間隔 1 秒

results.forEach(result => {
    if (result.success) {
        console.log(result.data.coverUrl);
    }
});
```

---

## 📊 回傳格式

### 成功

```javascript
{
    success: true,
    data: {
        code: 'SSIS-001',           // 番號
        title: '標題文字',          // 影片標題
        coverUrl: 'https://...',    // 封面圖片 URL
        detailUrl: 'https://...'    // 詳情頁面 URL
    }
}
```

### 失敗

```javascript
{
    success: false,
    error: '錯誤訊息'
}
```

---

## ⚙️ 技術細節

### 依賴套件

- `axios` - HTTP 請求（已有）
- `cheerio` - HTML 解析（已有）

**無需安裝新套件** ✅

### 速率限制

- 最多 10 次請求 / 分鐘
- 自動節流保護
- 批次查詢自動間隔

### 錯誤處理

- 網路錯誤
- 超時處理
- 找不到番號
- 格式錯誤

---

## ⚠️ 使用限制

### 技術限制

- JavDB 網站結構變更可能導致失效
- 需要穩定的網路連接
- 受速率限制保護

### 法律與道德

- ⚠️ 內容涉及成人資訊
- ⚠️ 可能違反網站服務條款
- ⚠️ 僅供個人學習測試

**請謹慎使用，尊重網站規則**

---

## 🗑️ 完全移除

### 刪除步驟

```bash
# 從專案根目錄執行
rm -rf tests/javdb
```

或直接刪除 `tests/javdb/` 資料夾。

**無其他相依性，可完全移除** ✅

---

## 🐛 常見問題

### Q: 找不到番號

**A**: 可能原因：
1. 番號不存在或拼寫錯誤
2. 網站沒有該番號資料
3. 網站結構已變更

### Q: 連接失敗

**A**: 可能原因：
1. 網路連接問題
2. JavDB 網站無法訪問
3. 被防火牆阻擋

### Q: 請求過於頻繁

**A**: 等待 1 分鐘後再試，或減少批次查詢數量

---

## 📝 測試記錄

**測試日期**: 2026-01-09  
**測試環境**: Node.js  
**狀態**: ⚠️ 僅供測試，未經充分驗證

---

## ⚖️ 免責聲明

本模組僅供技術學習與測試用途：

1. 不保證功能持續可用
2. 不承擔任何法律責任
3. 使用者需自行承擔風險
4. 請遵守相關法律法規

**建議**: 僅在本地測試使用，切勿公開部署或商業使用。

---

**最後更新**: 2026-01-09
