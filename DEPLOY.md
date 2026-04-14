# Deploy — Azure App Service

Single Node/Express app that serves `index.html` and exposes `POST /api/contact` (Mailgun).

## 1. Azure resources (once)

```bash
RG=binaxone-rg
APP=binaxone-web           # must be globally unique
LOCATION=southeastasia
PLAN=binaxone-plan

az group create -n $RG -l $LOCATION
az appservice plan create -g $RG -n $PLAN --is-linux --sku B1
az webapp create -g $RG -p $PLAN -n $APP --runtime "NODE:20-lts"
```

## 2. Application settings (env vars)

Paste in Azure Portal → App Service → **Configuration → Application settings**, or via CLI:

```bash
az webapp config appsettings set -g $RG -n $APP --settings \
  MAILGUN_API_KEY='<rotated key>' \
  MAILGUN_DOMAIN='mail.bina.cloud' \
  MAILGUN_SENDER_EMAIL='noreply@bina.cloud' \
  MAILGUN_SENDER_NAME='BinaXone Website' \
  SALES_INBOX='sales@bina.cloud' \
  WEBSITE_NODE_DEFAULT_VERSION='~20' \
  SCM_DO_BUILD_DURING_DEPLOYMENT='true'
```

Do **not** set `PORT` — App Service injects it.

## 3. Startup command

Azure Portal → Configuration → **General settings → Startup Command**:

```
npm ci --omit=dev && node server.js
```

(Or rely on the default `npm start` if `SCM_DO_BUILD_DURING_DEPLOYMENT=true` already ran `npm ci` at deploy time — in that case just `node server.js`.)

## 4. Health check

Azure Portal → **Health check** → enable, path = `/healthz`.

## 5. Deploy the code

Pick one:

### Option A — `az webapp up` (fastest)
From the repo root:
```bash
az webapp up -g $RG -n $APP --runtime "NODE:20-lts"
```

### Option B — GitHub Actions
Portal → Deployment Center → GitHub → pick repo/branch. Azure generates a workflow that runs `npm ci` + `npm run build` (skipped here) and deploys. Done.

### Option C — Zip deploy
```bash
zip -r app.zip . -x "node_modules/*" ".git/*" ".env"
az webapp deploy -g $RG -n $APP --src-path app.zip --type zip
```

## 6. Verify

```bash
curl https://$APP.azurewebsites.net/healthz            # -> ok
open https://$APP.azurewebsites.net                    # submit the contact form with a test inbox
az webapp log tail -g $RG -n $APP                      # watch logs live
```

Expected on a real submission:
- Browser: form replaced with "Thanks — message received."
- `sales@bina.cloud`: notification with `Reply-To` = submitter.
- Submitter inbox: auto-acknowledgement.

## Troubleshooting

- **500 on /api/contact** → check `az webapp log tail`. Most common cause: missing/misnamed env var or unrotated/invalid Mailgun key.
- **App doesn't start** → Log stream shows `Error: Cannot find module 'express'`. Fix: set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and redeploy, or include `npm ci` in the startup command.
- **Emails don't arrive** → Mailgun dashboard → Sending → Logs for `mail.bina.cloud`. Look for `failed`/`rejected` rows.
