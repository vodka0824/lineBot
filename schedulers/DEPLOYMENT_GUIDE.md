# Cloud Scheduler 部署指南

## 📋 前置準備

### 1. 確認 Google Cloud 專案資訊

```powershell
# 查看當前專案
gcloud config get-value project

# 如需切換專案
gcloud config set project YOUR_PROJECT_ID
```

### 2. 啟用必要的 API

```powershell
# 啟用 Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com

# 啟用 Cloud Run API (應該已啟用)
gcloud services enable run.googleapis.com
```

### 3. 獲取 Cloud Run 服務 URL

```powershell
# 列出所有 Cloud Run 服務
gcloud run services list

# 獲取特定服務的 URL
gcloud run services describe YOUR_SERVICE_NAME --region=asia-east1 --format="value(status.url)"
```

**範例輸出**: `https://your-service-xxx-xxx.a.run.app`

---

## 🚀 部署 Cloud Scheduler

### 方法 A: 使用 gcloud 指令 (推薦)

```powershell
# 設定變數 (請替換為實際值)
$SERVICE_URL = "https://your-service-xxx-xxx.a.run.app"
$PROJECT_ID = "your-project-id"
$REGION = "asia-east1"

# 建立 Cloud Scheduler job
gcloud scheduler jobs create http prefetch-daily-horoscope `
  --location=$REGION `
  --schedule="5 0 * * *" `
  --time-zone="Asia/Taipei" `
  --uri="$SERVICE_URL/api/prefetch/horoscope" `
  --http-method=POST `
  --headers="Content-Type=application/json" `
  --message-body='{"type":"daily"}' `
  --description="Prefetch all horoscope data daily at 00:05 Taiwan time"
```

### 方法 B: 透過 Google Cloud Console

1. 前往 [Cloud Console > Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
2. 點擊「建立工作」
3. 填寫以下資訊:

   | 欄位 | 值 |
   |------|-----|
   | 名稱 | `prefetch-daily-horoscope` |
   | 地區 | `asia-east1` |
   | 說明 | Prefetch all horoscope data daily at 00:05 |
   | 頻率 | `5 0 * * *` |
   | 時區 | `Asia/Taipei (GMT+8)` |
   | 目標類型 | HTTP |
   | URL | `https://YOUR_SERVICE_URL/api/prefetch/horoscope` |
   | HTTP 方法 | POST |
   | 主體 | `{"type":"daily"}` |

4. 點擊「建立」

---

## ✅ 驗證部署

### 1. 檢查 Scheduler 狀態

```powershell
# 列出所有 scheduler jobs
gcloud scheduler jobs list --location=asia-east1

# 查看特定 job 詳細資訊
gcloud scheduler jobs describe prefetch-daily-horoscope --location=asia-east1
```

### 2. 手動觸發測試

```powershell
# 立即執行一次 (不等排程時間)
gcloud scheduler jobs run prefetch-daily-horoscope --location=asia-east1
```

### 3. 查看執行記錄

```powershell
# 查看 Cloud Run logs
gcloud run services logs read YOUR_SERVICE_NAME --region=asia-east1 --limit=50
```

或前往 [Cloud Console > Logging](https://console.cloud.google.com/logs)，搜尋:
```
resource.type="cloud_run_revision"
"[Prefetch]"
```

---

## 🔧 管理指令

### 暫停 Scheduler

```powershell
gcloud scheduler jobs pause prefetch-daily-horoscope --location=asia-east1
```

### 恢復 Scheduler

```powershell
gcloud scheduler jobs resume prefetch-daily-horoscope --location=asia-east1
```

### 更新排程時間

```powershell
gcloud scheduler jobs update http prefetch-daily-horoscope `
  --location=asia-east1 `
  --schedule="0 1 * * *"  # 改為每天 01:00
```

### 刪除 Scheduler

```powershell
gcloud scheduler jobs delete prefetch-daily-horoscope --location=asia-east1
```

---

## 📊 監控與除錯

### 查看執行歷史

前往 [Cloud Console > Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)，點擊 job 名稱查看:
- 下次執行時間
- 最近執行狀態
- 執行記錄

### 常見問題

**Q: 顯示 403 Forbidden**
- **原因**: Cloud Scheduler 沒有權限呼叫 Cloud Run
- **解決**: 
  ```powershell
  # 取得 Cloud Scheduler 的服務帳戶
  $PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
  $SCHEDULER_SA = "service-$PROJECT_NUMBER@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
  
  # 授予 Cloud Run Invoker 權限
  gcloud run services add-iam-policy-binding YOUR_SERVICE_NAME `
    --region=asia-east1 `
    --member="serviceAccount:$SCHEDULER_SA" `
    --role="roles/run.invoker"
  ```

**Q: 如何確認預取成功?**
- 查看 Cloud Run logs 是否有 `[Prefetch] Starting horoscope prefetch`
- 查看 Memory Cache 命中率是否提升

**Q: Cron 語法說明**
- `5 0 * * *` = 每天 00:05
- `0 */6 * * *` = 每 6 小時
- `0 0 * * 0` = 每週日 00:00

---

## 🎯 下一步

部署完成後:
1. 等待第二天 00:05 觀察自動執行
2. 或立即手動觸發測試: `gcloud scheduler jobs run prefetch-daily-horoscope --location=asia-east1`
3. 監控 Cloud Run logs 確認預取成功
4. 測試星座查詢功能,應該幾乎即時回應

---

_建立時間: 2026-01-09_
