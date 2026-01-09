# Cloud Scheduler 部署指南 - 星座預取（分層排程）

## 📋 優化後的排程策略

**核心理念**: 依運勢更新頻率設定預取排程

- 🌅 **每日運勢**: 每天更新 → 每天 00:05 預取
- 📅 **每週運勢**: 每週更新 → 每週一 00:10 預取
- 📆 **每月運勢**: 每月更新 → 每月 1 號 00:15 預取

**好處**:
- ✅ 減少 **67%** 不必要的爬蟲次數 (36次/天 → 12次/天)
- ✅ 降低對星座網站的負擔
- ✅ 節省 Cloud Run CPU 時間

---

## 🚀 快速部署（三合一）

### 準備工作

```powershell
# 1. 獲取 Cloud Run URL
$SERVICE_URL = gcloud run services describe linebot --region=asia-east1 --format="value(status.url)"

# 2. 確認 URL
echo $SERVICE_URL
# 應顯示: https://linebot-xxx.asia-east1.run.app
```

---

### 一次部署三個 Scheduler

```powershell
# === 1. 每日運勢 (每天 00:05) ===
gcloud scheduler jobs create http prefetch-daily-horoscope `
  --location=asia-east1 `
  --schedule="5 0 * * *" `
  --time-zone="Asia/Taipei" `
  --uri="$SERVICE_URL/api/prefetch/horoscope" `
  --http-method=POST `
  --headers="Content-Type=application/json" `
  --message-body='{\"type\":\"daily\"}' `
  --description="Prefetch DAILY horoscope at 00:05"

# === 2. 每週運勢 (每週一 00:10) ===
gcloud scheduler jobs create http prefetch-weekly-horoscope `
  --location=asia-east1 `
  --schedule="10 0 * * 1" `
  --time-zone="Asia/Taipei" `
  --uri="$SERVICE_URL/api/prefetch/horoscope" `
  --http-method=POST `
  --headers="Content-Type=application/json" `
  --message-body='{\"type\":\"weekly\"}' `
  --description="Prefetch WEEKLY horoscope every Monday at 00:10"

# === 3. 每月運勢 (每月 1 號 00:15) ===
gcloud scheduler jobs create http prefetch-monthly-horoscope `
  --location=asia-east1 `
  --schedule="15 0 1 * *" `
  --time-zone="Asia/Taipei" `
  --uri="$SERVICE_URL/api/prefetch/horoscope" `
  --http-method=POST `
  --headers="Content-Type=application/json" `
  --message-body='{\"type\":\"monthly\"}' `
  --description="Prefetch MONTHLY horoscope on 1st of each month at 00:15"
```

---

## ✅ 驗證部署

### 查看所有 Scheduler Jobs

```powershell
gcloud scheduler jobs list --location=asia-east1 | Select-String "horoscope"
```

**預期輸出**:
```
prefetch-daily-horoscope     asia-east1  5 0 * * *      已啟用
prefetch-weekly-horoscope    asia-east1  10 0 * * 1     已啟用  
prefetch-monthly-horoscope   asia-east1  15 0 1 * *     已啟用
```

---

### 手動測試三個端點

```powershell
# 測試每日運勢
gcloud scheduler jobs run prefetch-daily-horoscope --location=asia-east1

# 測試每週運勢
gcloud scheduler jobs run prefetch-weekly-horoscope --location=asia-east1

# 測試每月運勢
gcloud scheduler jobs run prefetch-monthly-horoscope --location=asia-east1

# 等待 10 秒後查看 logs
Start-Sleep -Seconds 10
gcloud run services logs read linebot --region=asia-east1 --limit=30
```

**成功標誌**: 應看到類似以下 logs
```
[Prefetch] Starting horoscope prefetch: daily
[Prefetch] Starting horoscope prefetch: weekly
[Prefetch] Starting horoscope prefetch: monthly
```

---

## 📅 排程時間表

### 每日執行

```
00:05 - 預取每日運勢 (12 星座)
```

### 每週執行（僅週一）

```
週一 00:10 - 預取每週運勢 (12 星座)
```

### 每月執行（僅 1 號）

```
每月 1 號 00:15 - 預取每月運勢 (12 星座)
```

### 完整月份示例

```
1月1日 (三)  00:05 每日 ✓  00:15 每月 ✓
1月2日 (四)  00:05 每日 ✓
1月3日 (五)  00:05 每日 ✓
1月4日 (六)  00:05 每日 ✓
1月5日 (日)  00:05 每日 ✓
1月6日 (一)  00:05 每日 ✓  00:10 每週 ✓
1月7日 (二)  00:05 每日 ✓
...
```

---

## 🔧 管理指令

### 暫停特定 Scheduler

```powershell
# 僅暫停每週運勢
gcloud scheduler jobs pause prefetch-weekly-horoscope --location=asia-east1

# 僅暫停每月運勢
gcloud scheduler jobs pause prefetch-monthly-horoscope --location=asia-east1
```

### 恢復 Scheduler

```powershell
gcloud scheduler jobs resume prefetch-weekly-horoscope --location=asia-east1
gcloud scheduler jobs resume prefetch-monthly-horoscope --location=asia-east1
```

### 刪除 Scheduler

```powershell
# 刪除全部
gcloud scheduler jobs delete prefetch-daily-horoscope --location=asia-east1
gcloud scheduler jobs delete prefetch-weekly-horoscope --location=asia-east1
gcloud scheduler jobs delete prefetch-monthly-horoscope --location=asia-east1
```

---

## 📊 效益分析

### 爬蟲次數對比

**優化前** (每天預取全部):
```
每天: 12星座 × 3類型 = 36 次爬蟲
每月: 36 × 30 = 1080 次爬蟲
```

**優化後** (分層預取):
```
每日: 12 星座 × 1次/天 = 12 次
每週: 12 星座 × 4次/月 ≈ 48 次
每月: 12 星座 × 1次/月 = 12 次
每月總計: (12 × 30) + 48 + 12 = 420 次爬蟲
```

**節省**: (1080 - 420) / 1080 = **61%** ↓

---

## 🎯 下一步

部署完成後:
1. ✅ 等待自動執行或手動觸發測試
2. ✅ 觀察 Cloud Run logs 確認三個類型都正常運作
3. ✅ 測試用戶查詢每日/每週/每月運勢是否都能快速回應

---

## 💡 Cron 語法快速參考

```
5 0 * * *     → 每天 00:05
10 0 * * 1    → 每週一 00:10 (1 = Monday)
15 0 1 * *    → 每月 1 號 00:15
0 0 * * 0     → 每週日 00:00 (0 = Sunday)
0 12 15 * *   → 每月 15 號 12:00
```

---

_最後更新: 2026-01-09_
