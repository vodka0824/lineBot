# Cloud Tasks 設定指南

## 步驟 1：建立 Cloud Tasks Queue

### 使用 gcloud CLI（推薦）
```bash
gcloud tasks queues create linebot-tasks \
    --location=asia-east1 \
    --max-concurrent-dispatches=10 \
    --max-dispatches-per-second=5
```

### 或使用 Console
1. 前往 [Cloud Console > Cloud Tasks](https://console.cloud.google.com/cloudtasks)
2. 點擊「建立佇列」
3. 設定：
   - 名稱：`linebot-tasks`
   - 地區：`asia-east1`（或您的 Cloud Run 服務所在地區）
   - 最大並行分派：`10`
   - 最大分派速率：`5/秒`
4. 點擊「建立」

---

## 步驟 2：設定環境變數

### Cloud Run 環境變數設定
前往 Cloud Run 服務 > 編輯與部署新版本 > 變數與密鑰：

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
CLOUD_RUN_SERVICE_URL=https://your-service-xxxxx-uc.a.run.app
```

**取得 Service URL**：
- 部署後，在 Cloud Run 服務詳情頁面可看到完整的 URL
- 格式：`https://[SERVICE-NAME]-[HASH]-[REGION].a.run.app`

---

## 步驟 3：安裝依賴

```bash
npm install
```

這會自動安裝 `@google-cloud/tasks`。

---

## 步驟 4：部署至 Cloud Run

```bash
gcloud run deploy linebot \
    --source . \
    --region asia-east1 \
    --allow-unauthenticated
```

---

## 驗證設定

### 1. 檢查 Queue 狀態
```bash
gcloud tasks queues describe linebot-tasks --location=asia-east1
```

### 2. 測試 Worker Endpoint
```bash
curl -X POST https://your-service-url/worker \
  -H "Content-Type: application/json" \
  -d '{"handlerName":"test","params":{}}'
```

應回應 `500 Error`（因為沒有 test handler），但這確認 endpoint 存在。

---

## 常見問題

### Q: Cloud Tasks 建立失敗
**A**: 確認 Cloud Tasks API 已啟用：
```bash
gcloud services enable cloudtasks.googleapis.com
```

### Q: 權限錯誤 (403)
**A**: 確保 Cloud Run 服務帳號有 Cloud Tasks 權限：
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/cloudtasks.enqueuer"
```

### Q: Worker endpoint 無法訪問
**A**: 
1. 確認 `/worker` endpoint 已在 `server.js` 註冊
2. 確認 Cloud Run 服務已部署最新版本
3. 檢查 Cloud Run 日誌：
   ```bash
   gcloud run services logs read linebot --region=asia-east1
   ```

---

## 下一步

Phase 1 完成後，繼續執行 Phase 2：重構 Handlers。
